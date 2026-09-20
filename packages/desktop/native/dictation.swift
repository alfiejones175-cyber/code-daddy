import AVFoundation
import Foundation
import Speech

struct Event: Encodable {
  let id: String
  let type: String
  let text: String?
  let error: String?
}

let arguments = CommandLine.arguments

func argument(_ name: String) -> String? {
  guard let index = arguments.firstIndex(of: name), arguments.indices.contains(index + 1) else { return nil }
  return arguments[index + 1]
}

func emit(_ event: Event) {
  guard let data = try? JSONEncoder().encode(event), let line = String(data: data, encoding: .utf8) else { return }
  print(line)
  fflush(stdout)
}

if arguments.contains("--probe") {
  let info = Bundle.main.infoDictionary
  guard Bundle.main.bundleIdentifier != nil,
        info?["NSMicrophoneUsageDescription"] as? String != nil,
        info?["NSSpeechRecognitionUsageDescription"] as? String != nil else { exit(1) }
  print("ok")
  exit(0)
}

guard let id = argument("--id"), let locale = argument("--locale") else { exit(2) }

final class Dictation: NSObject, SFSpeechRecognitionTaskDelegate {
  let id: String
  let recognizer: SFSpeechRecognizer?
  let audio = AVAudioEngine()
  var request: SFSpeechAudioBufferRecognitionRequest?
  var task: SFSpeechRecognitionTask?
  var ended = false
  var cancelling = false
  var tapInstalled = false
  var stopping = false

  init(id: String, locale: String) {
    self.id = id
    self.recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale))
  }

  func finish(_ error: String? = nil) {
    guard !ended else { return }
    ended = true
    if tapInstalled {
      audio.stop()
      audio.inputNode.removeTap(onBus: 0)
      tapInstalled = false
    }
    task?.cancel()
    if let error = error, !cancelling { emit(Event(id: id, type: "error", text: nil, error: error)) }
    emit(Event(id: id, type: "end", text: nil, error: nil))
    exit(error == nil ? 0 : 1)
  }

  func start() {
    guard let recognizer = recognizer, recognizer.isAvailable else { finish("unavailable"); return }
    SFSpeechRecognizer.requestAuthorization { status in
      DispatchQueue.main.async {
        guard !self.stopping else { self.finish(); return }
        guard status == .authorized else { self.finish("permission"); return }
        AVCaptureDevice.requestAccess(for: .audio) { allowed in
          DispatchQueue.main.async {
            guard !self.stopping else { self.finish(); return }
            guard allowed else { self.finish("permission"); return }
            self.record(recognizer)
          }
        }
      }
    }
  }

  func record(_ recognizer: SFSpeechRecognizer) {
    guard !stopping && !ended else { finish(); return }
    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = false
    if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
    self.request = request
    let input = audio.inputNode
    let format = input.outputFormat(forBus: 0)
    guard format.sampleRate > 0, format.channelCount > 0 else { finish("unavailable"); return }
    input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in request.append(buffer) }
    tapInstalled = true
    task = recognizer.recognitionTask(with: request) { result, error in
      DispatchQueue.main.async {
        if let result = result, result.isFinal {
          let text = result.bestTranscription.formattedString
          if !text.isEmpty && !self.cancelling { emit(Event(id: self.id, type: "result", text: text, error: nil)) }
          self.finish()
          return
        }
        if error != nil { self.finish("failed") }
      }
    }
    do {
      audio.prepare()
      try audio.start()
      emit(Event(id: id, type: "started", text: nil, error: nil))
    } catch {
      finish("failed")
    }
  }

  func stop() {
    stopping = true
    if !tapInstalled { finish(); return }
    audio.stop()
    request?.endAudio()
  }

  func cancel() {
    cancelling = true
    finish()
  }
}

let dictation = Dictation(id: id, locale: locale)
dictation.start()
DispatchQueue.global().async {
  while let line = readLine() {
    DispatchQueue.main.async {
      if line == "stop" { dictation.stop() }
      if line == "cancel" { dictation.cancel() }
    }
  }
}
dispatchMain()
