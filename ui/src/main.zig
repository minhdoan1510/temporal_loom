const std = @import("std");
const runner = @import("runner");
const zero_native = @import("zero-native");

pub const panic = std.debug.FullPanic(zero_native.debug.capturePanic);

const App = struct {
    env_map: *std.process.Environ.Map,

    fn app(self: *@This()) zero_native.App {
        return .{
            .context = self,
            .name = "lending-claw",
            .source = zero_native.WebViewSource.url("http://127.0.0.1:8080/"),
            .source_fn = source,
        };
    }

    fn source(context: *anyopaque) anyerror!zero_native.WebViewSource {
        const self: *@This() = @ptrCast(@alignCast(context));
        if (self.env_map.get("ZERO_NATIVE_FRONTEND_URL")) |url| {
            if (url.len > 0) return zero_native.WebViewSource.url(url);
        }
        return zero_native.WebViewSource.url("http://127.0.0.1:8080/");
    }
};

const dev_origins = [_][]const u8{ "zero://app", "zero://inline", "http://127.0.0.1:5173", "http://127.0.0.1:8080" };

pub fn main(init: std.process.Init) !void {
    var app = App{ .env_map = init.environ_map };
    try runner.runWithOptions(app.app(), .{
        .app_name = "Lending Claw",
        .window_title = "Lending Claw",
        .bundle_id = "vn.zalopay.lending-claw",
        .icon_path = "assets/icon.icns",
        .security = .{
            .navigation = .{ .allowed_origins = &dev_origins },
        },
    }, init);
}

test "app name is configured" {
    try std.testing.expectEqualStrings("lending-claw", "lending-claw");
}
