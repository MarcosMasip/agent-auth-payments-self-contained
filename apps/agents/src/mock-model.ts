import { AIMessage } from "@langchain/core/messages";

export class MockChatModel {
  bindTools(_: any) {
    return this;
  }
  async invoke(messages: Array<{ role: string; content: any }>) {
    const last = messages[messages.length - 1];
    const content = typeof last?.content === "string" ? last.content : JSON.stringify(last?.content ?? "");
    return new AIMessage({ content: `Mock response: ${content.slice(0, 200)}` });
  }
}
