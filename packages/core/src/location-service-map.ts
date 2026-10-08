import { Context, Effect, Layer, LayerMap, RcMap } from "effect"
import { LayerNode } from "./effect/layer-node"
import { Node } from "./effect/app-node"
import { Location } from "./location"
import type { LocationError, LocationServices } from "./location-services"

export class Service extends Context.Service<
  Service,
  LayerMap.LayerMap<Location.Ref, LocationServices, LocationError>
>()("@opencode/example/LocationServiceMap") {
  static get(ref: Location.Ref) {
    return Layer.unwrap(Effect.map(Service, (locations) => locations.get(ref)))
  }

  static invalidateAll(locations: LayerMap.LayerMap<Location.Ref, LocationServices, LocationError>) {
    return Effect.gen(function* () {
      yield* Effect.forEach(yield* RcMap.keys(locations.rcMap), (ref) => locations.invalidate(ref))
    })
  }
}

export const node = LayerNode.unbound(Service, Node.tags.values.global)

export * as LocationServiceMap from "./location-service-map"
