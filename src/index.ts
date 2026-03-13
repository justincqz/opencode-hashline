import type { Plugin, Hooks } from "@opencode-ai/plugin"
import { createHashlineHooks } from "./plugin"
import { hashlineEditTool } from "./tool"

const HashlinePlugin: Plugin = async (ctx) => {
  const hooks = createHashlineHooks()
  return {
    ...hooks,
    tool: {
      "hashline-edit": hashlineEditTool,
    },
  } as unknown as Hooks
}

export default HashlinePlugin
