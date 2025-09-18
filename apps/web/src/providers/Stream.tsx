import React, { createContext, useContext, ReactNode, useState, useMemo } from "react";
import { useStream } from "@langchain/langgraph-sdk/react";
import { type Message } from "@langchain/langgraph-sdk";
import {
  uiMessageReducer,
  isUIMessage,
  isRemoveUIMessage,
  type UIMessage,
  type RemoveUIMessage,
} from "@langchain/langgraph-sdk/react-ui";
import { useQueryState } from "nuqs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LangGraphLogoSVG } from "@/components/icons/langgraph";
import { Label } from "@/components/ui/label";
import { ArrowRight } from "lucide-react";
import { useThreads } from "./Thread";
import { useAuthContext } from "@/providers/Auth";

export type StateType = { messages: Message[]; ui?: UIMessage[] };

const useTypedStream = useStream<
  StateType,
  {
    UpdateType: {
      messages?: Message[] | Message | string;
      ui?: (UIMessage | RemoveUIMessage)[] | UIMessage | RemoveUIMessage;
      context?: Record<string, unknown>;
    };
    CustomEventType: UIMessage | RemoveUIMessage;
  }
>;

type StreamContextType = ReturnType<typeof useTypedStream>;
const StreamContext = createContext<StreamContextType | undefined>(undefined);

async function sleep(ms = 4000) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Inner component that actually establishes the stream connection once authenticated
const StreamConnected = ({ children, apiUrl, assistantId, jwt }: { children: ReactNode; apiUrl: string; assistantId: string; jwt: string }) => {
  const [threadId, setThreadId] = useQueryState("threadId");
  const { getThreads, setThreads } = useThreads();
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const streamValue = useTypedStream({
    apiUrl,
    assistantId,
    threadId: threadId ?? null,
    defaultHeaders: {
      Authorization: `Bearer ${jwt}`,
      "x-supabase-access-token": jwt,
    },
    onCustomEvent: (event, options) => {
      if (isUIMessage(event) || isRemoveUIMessage(event)) {
        options.mutate((prev) => {
          const ui = uiMessageReducer(prev.ui ?? [], event);
          return { ...prev, ui };
        });
      }
    },
    onThreadId: (id) => {
      setThreadId(id);
      sleep().then(() => getThreads().then(setThreads).catch(console.error));
    },
    onError: (err) => {
      let message: string;
      if (err instanceof Event) {
        message = `Unable to establish stream with ${apiUrl}. Ensure the agents server is running (dev:self-contained) and reachable.`;
      } else if (err && typeof err === "object" && "message" in err) {
        // @ts-expect-error
        message = err.message || "Unknown streaming error";
      } else {
        message = String(err);
      }
      console.error("[StreamConnected] stream error", err);
      setConnectionError(message);
    },
  });

  const resetConnection = () => {
    setConnectionError(null);
  setThreadId((prev) => prev ?? null);
  };

  if (connectionError) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center p-4">
        <div className="max-w-md space-y-4 rounded-lg border bg-background p-6 text-center shadow-sm">
          <h2 className="text-lg font-semibold">Connection Issue</h2>
            <p className="text-muted-foreground text-sm whitespace-pre-line">{connectionError}</p>
          <div className="flex flex-col gap-2">
            <button
              onClick={resetConnection}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:opacity-90"
            >
              Retry Connection
            </button>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              Reload Page
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <StreamContext.Provider value={streamValue}>{children}</StreamContext.Provider>
  );
};

const StreamSession = ({
  children,
  apiUrl,
  assistantId,
}: {
  children: ReactNode;
  apiUrl: string;
  assistantId: string;
}) => {
  const { session, isLoading: authLoading, isAuthenticated } = useAuthContext();
  const jwt = session?.accessToken;

  if (authLoading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center">
        <div className="text-center">
          <div className="border-primary mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !jwt) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center p-4">
        <div className="max-w-md rounded-lg border bg-background p-8 text-center shadow-sm">
          <LangGraphLogoSVG className="mx-auto mb-4 h-10" />
          <h2 className="mb-2 text-xl font-semibold tracking-tight">Sign in to start chatting</h2>
          <p className="text-muted-foreground mb-6 text-sm">
            You need to create an account or sign in before starting a chat. This lets us track your local credits and associate threads with your user.
          </p>
          <div className="flex flex-col gap-3">
            <a
              href="/signup"
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:opacity-90"
            >
              Create account
            </a>
            <a
              href="/signin"
              className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              Sign in
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <StreamConnected apiUrl={apiUrl} assistantId={assistantId} jwt={jwt}>
      {children}
    </StreamConnected>
  );
};

// Default values for the form (align with agents dev:self-contained port)
const DEFAULT_API_URL = "http://localhost:2025";
const DEFAULT_ASSISTANT_ID = "agent";

export const StreamProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  // Get environment variables
  const envApiUrl: string | undefined = process.env.NEXT_PUBLIC_API_URL;
  const envAssistantId: string | undefined =
    process.env.NEXT_PUBLIC_ASSISTANT_ID;

  // Use URL params with env var fallbacks
  const [apiUrl, setApiUrl] = useQueryState("apiUrl", {
    defaultValue: envApiUrl || "",
  });
  const [assistantId, setAssistantId] = useQueryState("assistantId", {
    defaultValue: envAssistantId || "",
  });

  // Determine final values to use, prioritizing URL params then env vars
  const finalApiUrl = apiUrl || envApiUrl;
  const finalAssistantId = assistantId || envAssistantId;

  // Basic apiUrl validation
  const apiUrlInvalid = useMemo(() => {
    if (!finalApiUrl) return true;
    try {
      const u = new URL(finalApiUrl);
      return !(u.protocol === "http:" || u.protocol === "https:");
    } catch {
      return true;
    }
  }, [finalApiUrl]);

  // Show the form if we: don't have an API URL, assistant ID, or invalid url
  if (!finalApiUrl || !finalAssistantId || apiUrlInvalid) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center p-4">
        <div className="animate-in fade-in-0 zoom-in-95 bg-background flex max-w-3xl flex-col rounded-lg border shadow-lg">
          <div className="mt-14 flex flex-col gap-2 border-b p-6">
            <div className="flex flex-col items-start gap-2">
              <LangGraphLogoSVG className="h-7" />
              <h1 className="text-xl font-semibold tracking-tight">
                Agent Chat
              </h1>
            </div>
            <p className="text-muted-foreground">
              Welcome to Agent Chat! Before you get started, you need to enter
              the URL of the deployment and the assistant / graph ID.
              {apiUrlInvalid && finalApiUrl ? (
                <span className="block pt-2 text-sm text-rose-500">The provided API URL is invalid. Please correct it.</span>
              ) : null}
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();

              const form = e.target as HTMLFormElement;
              const formData = new FormData(form);
              const apiUrl = formData.get("apiUrl") as string;
              const assistantId = formData.get("assistantId") as string;

              setApiUrl(apiUrl);
              setAssistantId(assistantId);

              form.reset();
            }}
            className="bg-muted/50 flex flex-col gap-6 p-6"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="apiUrl">
                Deployment URL<span className="text-rose-500">*</span>
              </Label>
              <p className="text-muted-foreground text-sm">
                This is the URL of your LangGraph deployment. Can be a local, or
                production deployment.
              </p>
              <Input
                id="apiUrl"
                name="apiUrl"
                className="bg-background"
                defaultValue={apiUrl || DEFAULT_API_URL}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="assistantId">
                Assistant / Graph ID<span className="text-rose-500">*</span>
              </Label>
              <p className="text-muted-foreground text-sm">
                This is the ID of the graph (can be the graph name), or
                assistant to fetch threads from, and invoke when actions are
                taken.
              </p>
              <Input
                id="assistantId"
                name="assistantId"
                className="bg-background"
                defaultValue={assistantId || DEFAULT_ASSISTANT_ID}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="apiKey">LangSmith API Key</Label>
              <p className="text-muted-foreground text-sm">
                This is <strong>NOT</strong> required if using a local LangGraph
                server. This value is stored in your browser's local storage and
                is only used to authenticate requests sent to your LangGraph
                server.
              </p>
            </div>

            <div className="mt-2 flex justify-end">
              <Button
                type="submit"
                size="lg"
              >
                Continue
                <ArrowRight className="size-5" />
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <StreamSession apiUrl={finalApiUrl} assistantId={finalAssistantId}>
      {children}
    </StreamSession>
  );
};

// Create a custom hook to use the context
export const useStreamContext = (): StreamContextType => {
  const context = useContext(StreamContext);
  if (context === undefined) {
    throw new Error("useStreamContext must be used within a StreamProvider");
  }
  return context;
};

export default StreamContext;
