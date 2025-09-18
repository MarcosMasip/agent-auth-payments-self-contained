import { initChatModel } from "langchain/chat_models/universal";
import { getLocalModel } from "./model-provider.js";

/**
 * Load a chat model from a fully specified name.
 * @param fullySpecifiedName - String in the format 'provider/model' or 'provider/account/provider/model'.
 * @returns A Promise that resolves to a BaseChatModel instance.
 */
export async function loadChatModel(fullySpecifiedName: string) {
  if (process.env.LOCAL_MODE === "true") {
    const { model } = await getLocalModel();
    return model as any; // loosely typed minimal interface
  }
  const index = fullySpecifiedName.indexOf("/");
  if (index === -1) {
    return await initChatModel(fullySpecifiedName);
  }
  const provider = fullySpecifiedName.slice(0, index);
  const model = fullySpecifiedName.slice(index + 1);
  return await initChatModel(model, { modelProvider: provider });
}
