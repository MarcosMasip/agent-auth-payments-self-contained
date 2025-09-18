import { AIMessage } from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import { MessagesAnnotation, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";

import { ConfigurationSchema, ensureConfiguration } from "./configuration.js";
import { TOOLS } from "./tools.js";
import { loadChatModel } from "./utils.js";
import { getLocalModel } from "./model-provider.js";

// Define the function that calls the model
async function callModel(
  state: typeof MessagesAnnotation.State,
  config: RunnableConfig,
): Promise<typeof MessagesAnnotation.Update> {
  /** Call the LLM powering our agent. **/
  const configuration = ensureConfiguration(config);

  // Feel free to customize the prompt, model, and other logic!
  const baseModel = await loadChatModel(configuration.model);
  const model = baseModel.bindTools(TOOLS);

  const promptMessages = [
    {
      role: "system",
      content: configuration.systemPromptTemplate.replace(
        "{system_time}",
        new Date().toISOString(),
      ),
    },
    ...state.messages,
  ];

  let response: any;
  try {
    response = await model.invoke(promptMessages as any);
  } catch (err: any) {
    const msg = String(err?.message || err);
    const isMissingModel = /model '?.+?'? not found/i.test(msg) || /404/.test(msg);
    if (process.env.LOCAL_MODE === 'true' && isMissingModel) {
      console.warn('[ollama] Missing model detected during invoke, falling back to mock:', msg);
      const { model: fallback } = await getLocalModel(); // second call will return mock due to earlier detection failure
      try {
        response = await fallback.bindTools(TOOLS).invoke(promptMessages as any);
        (response as any)._fallback_reason = 'ollama_model_missing_runtime';
      } catch (inner) {
        throw inner; // propagate if even mock fails
      }
    } else {
      throw err;
    }
  }

  // Heuristic credit estimation only in LOCAL_MODE
  if (process.env.LOCAL_MODE === "true") {
    try {
      const { meta } = await getLocalModel();
      const userContent = state.messages
        .filter((m: any) => m.role === "user")
        .map((m: any) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
        .join("\n");
      const completionContent = (response as any)?.content ?? "";
      const promptChars = userContent.length;
      const completionChars = typeof completionContent === "string" ? completionContent.length : JSON.stringify(completionContent).length;
      const approxTokens = Math.max(1, Math.ceil((promptChars + completionChars) / 4));
      const divisor = parseInt(process.env.OLLAMA_CREDIT_DIVISOR || "1000", 10);
      const creditsUsed = Math.max(1, Math.ceil(approxTokens / divisor));
      // Attach metadata so UI could optionally use it later
      (response as any)._local_credit_estimate = {
        provider: meta.provider,
        model: meta.modelName,
        degraded: meta.degraded,
        approxTokens,
        creditsUsed,
        divisor,
      };
    } catch (e) {
      console.warn("[credits] Unable to compute credit estimate", e);
    }
  }

  // We return a list, because this will get added to the existing list
  return { messages: [response] };
}

// Define the function that determines whether to continue or not
function routeModelOutput(state: typeof MessagesAnnotation.State): string {
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1];
  // If the LLM is invoking tools, route there.
  if ((lastMessage as AIMessage)?.tool_calls?.length || 0 > 0) {
    return "tools";
  }
  // Otherwise end the graph.
  else {
    return "__end__";
  }
}

// Define a new graph. We use the prebuilt MessagesAnnotation to define state:
// https://langchain-ai.github.io/langgraphjs/concepts/low_level/#messagesannotation
const workflow = new StateGraph(MessagesAnnotation, ConfigurationSchema)
  // Define the two nodes we will cycle between
  .addNode("callModel", callModel)
  .addNode("tools", new ToolNode(TOOLS))
  // Set the entrypoint as `callModel`
  // This means that this node is the first one called
  .addEdge("__start__", "callModel")
  .addConditionalEdges(
    // First, we define the edges' source node. We use `callModel`.
    // This means these are the edges taken after the `callModel` node is called.
    "callModel",
    // Next, we pass in the function that will determine the sink node(s), which
    // will be called after the source node is called.
    routeModelOutput,
  )
  // This means that after `tools` is called, `callModel` node is called next.
  .addEdge("tools", "callModel");

// Finally, we compile it!
// This compiles it into a graph you can invoke and deploy.
export const graph = workflow.compile({
  interruptBefore: [], // if you want to update the state before calling the tools
  interruptAfter: [],
});
