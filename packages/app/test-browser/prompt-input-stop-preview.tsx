import { render } from "solid-js/web"
import { createStore } from "solid-js/store"
import { PromptInputV2SubmitButton } from "../../session-ui/src/v2/components/prompt-input"
import "../src/index.css"

function Control(props: Parameters<typeof PromptInputV2SubmitButton>[0] & { label: string; working: boolean }) {
  const [count, setCount] = createStore({ submitted: 0, stopped: 0 })
  return (
    <section class="flex items-center gap-3" data-state={props.label}>
      <span>{props.label}</span>
      <PromptInputV2SubmitButton
        {...props}
        onSubmit={() => setCount("submitted", (value) => value + 1)}
        onStop={() => setCount("stopped", (value) => value + 1)}
      />
      <output data-submit-count={count.submitted} data-stop-count={count.stopped}>
        {count.submitted}/{count.stopped}
      </output>
    </section>
  )
}

render(
  () => (
    <main class="flex w-full flex-col gap-4 p-6" data-component="prompt-input-stop-preview">
      <Control
        label="idle-empty"
        mode="normal"
        working={false}
        stopping={false}
        disabled
        sendLabel="Send"
        stopLabel="Stop"
        onSubmit={() => undefined}
        onStop={() => undefined}
      />
      <Control
        label="idle-draft"
        mode="normal"
        working={false}
        stopping={false}
        disabled={false}
        sendLabel="Send"
        stopLabel="Stop"
        onSubmit={() => undefined}
        onStop={() => undefined}
      />
      <Control
        label="working-empty"
        mode="normal"
        working
        stopping
        disabled
        sendLabel="Send"
        stopLabel="Stop"
        onSubmit={() => undefined}
        onStop={() => undefined}
      />
      <Control
        label="working-draft"
        mode="normal"
        working
        stopping={false}
        disabled={false}
        sendLabel="Send"
        stopLabel="Stop"
        onSubmit={() => undefined}
        onStop={() => undefined}
      />
      <Control
        label="working-draft-disabled"
        mode="normal"
        working
        stopping={false}
        disabled
        sendLabel="Send"
        stopLabel="Stop"
        onSubmit={() => undefined}
        onStop={() => undefined}
      />
    </main>
  ),
  document.getElementById("root")!,
)
