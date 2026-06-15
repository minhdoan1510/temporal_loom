package cmd

import (
	"bufio"
	"context"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/spf13/cobra"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/agent"
)

func init() {
	rootCmd.AddCommand(chatCmd())
}

func chatCmd() *cobra.Command {
	var (
		message    string
		sessionKey string
	)

	cmd := &cobra.Command{
		Use:   "chat [message]",
		Short: "Chat with the Zalopay agent",
		Long:  "Start an interactive session or send a one-shot message to the Zalopay agent.",
		RunE: func(cmd *cobra.Command, args []string) error {
			if len(args) > 0 && message == "" {
				message = strings.Join(args, " ")
			}
			return runChat(message, sessionKey)
		},
	}

	cmd.Flags().StringVarP(&message, "message", "m", "", "one-shot message")
	cmd.Flags().StringVarP(&sessionKey, "session", "s", "", "session key (default: auto-generated)")
	return cmd
}

func runChat(message, sessionKey string) error {
	ctx := context.Background()

	deps, cleanup, err := BuildDeps(ctx)
	if err != nil {
		return err
	}
	defer cleanup()

	// Default session key
	if sessionKey == "" {
		sessionKey = fmt.Sprintf("cli:%s", time.Now().Format("20060102-150405"))
	}

	// Event display
	onEvent := func(ctx context.Context, evt agent.AgentEvent) {
		switch evt.Type {
		case agent.EventToolCall:
			if payload, ok := evt.Payload.(map[string]interface{}); ok {
				fmt.Fprintf(os.Stderr, "  [tool] %v\n", payload["name"])
			}
		case agent.EventToolResult:
			if payload, ok := evt.Payload.(map[string]interface{}); ok {
				if isErr, ok := payload["is_error"].(bool); ok && isErr {
					fmt.Fprintf(os.Stderr, "  [tool error] %v\n", payload["name"])
				}
			}
		case agent.EventRunStarted:
			slog.DebugContext(ctx, "run started", "run_id", evt.RunID)
		case agent.EventRunCompleted:
			slog.DebugContext(ctx, "run completed", "run_id", evt.RunID)
		case agent.EventRunFailed:
			fmt.Fprintf(os.Stderr, "  [run failed] %v\n", evt.Payload)
		}
	}

	// Create agent loop
	loop := agent.NewLoop(agent.LoopConfig{
		ID:                      "lending-agent",
		Provider:                deps.Provider,
		Model:                   deps.Config.LLM.Model,
		ContextWindow:           deps.Config.Agent.ContextWindow,
		MaxIterations:           deps.Config.Agent.MaxIterations,
		MaxHistoryShare:         deps.Config.Agent.MaxHistoryShare,
		Sessions:                deps.Stores.Sessions,
		ContextFiles:            deps.Stores.ContextFiles,
		Tools:                   deps.ToolsReg,
		OnEvent:                 onEvent,
		MaxMessageChars:         deps.Config.Agent.MaxMessageChars,
		SkillsCache:             deps.SkillsCache,
		HasMemory:               deps.HasMemory,
		Memory:                  deps.MemManager,
		MemoryCaptureEveryTurns: deps.Config.Agent.MemoryCaptureEveryTurns,
		MemoryRecallMinScore:    deps.Config.Agent.MemoryRecallMinScore,
		Temperature:             deps.Config.Agent.Temperature,
		TopP:                    deps.Config.Agent.TopP,
	})

	// Empty workspace → EnsureSession/Run default to the default workspace.
	loop.EnsureSession("", sessionKey, "cli")

	if message != "" {
		return runOneShot(ctx, loop, sessionKey, message)
	}
	return runInteractive(ctx, loop, sessionKey)
}

func runOneShot(ctx context.Context, loop *agent.Loop, sessionKey, message string) error {
	result, err := loop.Run(ctx, agent.RunRequest{
		SessionKey: sessionKey,
		Message:    message,
		Channel:    "cli",
		RunID:      uuid.New().String(),
	})
	if err != nil {
		return err
	}
	fmt.Println(result.Content)
	return nil
}

func runInteractive(ctx context.Context, loop *agent.Loop, sessionKey string) error {
	fmt.Fprintf(os.Stderr, "lending-claw interactive mode (session: %s)\n", sessionKey)
	fmt.Fprintf(os.Stderr, "Type your message, or 'quit' to exit.\n\n")

	scanner := bufio.NewScanner(os.Stdin)
	for {
		fmt.Fprint(os.Stderr, "> ")
		if !scanner.Scan() {
			break
		}
		input := strings.TrimSpace(scanner.Text())
		if input == "" {
			continue
		}
		if input == "quit" || input == "exit" {
			break
		}

		result, err := loop.Run(ctx, agent.RunRequest{
			SessionKey: sessionKey,
			Message:    input,
			Channel:    "cli",
			RunID:      uuid.New().String(),
		})
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			continue
		}
		fmt.Println(result.Content)
		fmt.Println()
	}
	return nil
}
