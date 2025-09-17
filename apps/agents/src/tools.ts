/**
 * This file defines the tools available to the ReAct agent.
 * Tools are functions that the agent can use to interact with external systems or perform specific tasks.
 */
import { TavilySearchResults } from "@langchain/community/tools/tavily_search";
import { Tool } from "@langchain/core/tools";

/**
 * Tavily search tool configuration
 * This tool allows the agent to perform web searches using the Tavily API.
 */
const isLocal = process.env.LOCAL_MODE === "true";

const searchTavily: Tool = isLocal
  ? new (class extends Tool {
      name = "tavily_search_mock";
      description =
        "Mock web search tool for Local Mode that returns a canned response without hitting external APIs.";
      async _call(query: string) {
        return JSON.stringify({
          query,
          results: [
            {
              title: "Local Mode Search Result",
              url: "http://localhost/mock-search",
              content:
                "This is a mocked search result. In self-contained mode, external web search is disabled.",
            },
          ],
        });
      }
    })()
  : new TavilySearchResults({
      maxResults: 3,
    });

/**
 * Export an array of all available tools
 * Add new tools to this array to make them available to the agent
 *
 * Note: You can create custom tools by implementing the Tool interface from @langchain/core/tools
 * and add them to this array.
 * See https://js.langchain.com/docs/how_to/custom_tools/#tool-function for more information.
 */
export const TOOLS = [searchTavily];
