package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

// Version is set at build time via -ldflags "-X gitlab.zalopay.vn/fin/lending/lending-claw/cmd.Version=v1.0.0"
var Version = "dev"

func versionCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Print version information",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Printf("lending-claw %s\n", Version)
		},
	}
}
