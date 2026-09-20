import { createUniqueId, Show, type ComponentProps } from "solid-js"

export function WordmarkV2(props: Pick<ComponentProps<"svg">, "class"> & { brand?: "opencode" | "codedaddy" }) {
  const mask = createUniqueId()
  const maskGradient = createUniqueId()
  const width = () => (props.brand === "codedaddy" ? 812.308 : 720)

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${width()} 129`}
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <g opacity="0.6">
        <g mask={`url(#${mask})`}>
          <g opacity="0.16">
            <Show
              when={props.brand === "codedaddy"}
              fallback={
                <>
                  <path
                    opacity="0.7"
                    d="M55.3846 36.4286H18.4615V91.7143H55.3846V36.4286ZM73.8462 110.143H0V18H73.8462V110.143Z"
                    fill="currentColor"
                  />
                  <path
                    opacity="0.7"
                    d="M110.462 91.7143H147.385V36.4286H110.462V91.7143ZM165.846 110.143H110.462V128.571H92V18H165.846V110.143Z"
                    fill="currentColor"
                  />
                  <path
                    opacity="0.7"
                    d="M258.846 73.2857H203.462V91.7143H258.846V110.143H185V18H258.846V73.2857ZM203.462 54.8571H240.385V36.4286H203.462V54.8571Z"
                    fill="currentColor"
                  />
                  <path
                    opacity="0.7"
                    d="M332.385 36.4286H295.462V110.143H277V18H332.385V36.4286ZM350.846 110.143H332.385V36.4286H350.846V110.143Z"
                    fill="currentColor"
                  />
                  <path
                    opacity="0.7"
                    d="M442.846 36.4286H387.462V91.7143H442.846V110.143H369V18H442.846V36.4286Z"
                    fill="currentColor"
                  />
                  <path
                    opacity="0.7"
                    d="M517.385 36.4286H480.462V91.7143H517.385V36.4286ZM535.846 110.143H462V18H535.846V110.143Z"
                    fill="currentColor"
                  />
                  <path
                    opacity="0.7"
                    d="M609.385 36.8571H572.462V92.1429H609.385V36.8571ZM627.846 110.571H554V18.4286H609.385V0H627.846V110.571Z"
                    fill="currentColor"
                  />
                  <path
                    opacity="0.7"
                    d="M664.462 36.4286V54.8571H701.385V36.4286H664.462ZM719.846 73.2857H664.462V91.7143H719.846V110.143H646V18H719.846V73.2857Z"
                    fill="currentColor"
                  />
                </>
              }
            >
              <path
                opacity="0.7"
                d="M73.8462 36.4286H18.4615V91.7143H73.8462V110.143H0V18H73.8462V36.4286Z"
                fill="currentColor"
              />
              <path
                opacity="0.7"
                d="M147.692 36.4286H110.769V91.7143H147.692V36.4286ZM166.154 110.143H92.3077V18H166.154V110.143Z"
                fill="currentColor"
              />
              <path
                opacity="0.7"
                d="M240 36.8571H203.077V92.1429H240V36.8571ZM258.462 110.571H184.615V18.4286H240V0H258.462V110.571Z"
                fill="currentColor"
              />
              <path
                opacity="0.7"
                d="M350.769 73.2857H295.385V91.7143H350.769V110.143H276.923V18H350.769V73.2857ZM295.385 54.8571H332.308V36.4286H295.385V54.8571Z"
                fill="currentColor"
              />
              <path
                opacity="0.7"
                d="M424.615 36.8571H387.692V92.1429H424.615V36.8571ZM443.077 110.571H369.231V18.4286H424.615V0H443.077V110.571Z"
                fill="currentColor"
              />
              <path
                opacity="0.7"
                d="M480 18H535.385V36.4286H480ZM516.923 36.4286H535.385V91.7143H516.923ZM461.538 54.8571H516.923V73.2857H461.538ZM461.538 73.2857H480V91.7143H461.538ZM461.538 91.7143H535.385V110.143H461.538Z"
                fill="currentColor"
              />
              <path
                opacity="0.7"
                d="M609.231 36.8571H572.308V92.1429H609.231V36.8571ZM627.692 110.571H553.846V18.4286H609.231V0H627.692V110.571Z"
                fill="currentColor"
              />
              <path
                opacity="0.7"
                d="M701.538 36.8571H664.615V92.1429H701.538V36.8571ZM720 110.571H646.154V18.4286H701.538V0H720V110.571Z"
                fill="currentColor"
              />
              <path
                opacity="0.7"
                d="M738.462 18H756.923V91.7143H738.462ZM793.846 18H812.308V110.143H793.846ZM756.923 73.2857H793.846V91.7143H756.923ZM756.923 110.143H793.846V128.571H756.923Z"
                fill="currentColor"
              />
            </Show>
          </g>
        </g>
      </g>
      <defs>
        <mask id={mask} style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width={width()} height="129">
          <rect width={width()} height="129" fill={`url(#${maskGradient})`} />
        </mask>
        <linearGradient
          id={maskGradient}
          x1={width() / 2}
          y1="68"
          x2={width() / 2}
          y2="129"
          gradientUnits="userSpaceOnUse"
        >
          <stop stop-color="white" stop-opacity="0.7" />
          <stop offset="1" stop-color="white" stop-opacity="0" />
        </linearGradient>
      </defs>
    </svg>
  )
}
