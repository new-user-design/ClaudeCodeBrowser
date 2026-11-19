//
//  SafariWebExtensionHandler.swift
//  ClaudeCodeBrowser Extension
//
//  Answers browser.runtime.sendNativeMessage from the extension's background page.
//  Only one message is supported: {type: "getToken"} returns the MCP server's API
//  token from ~/.claudecodebrowser/api_token so the extension can authenticate.
//

import SafariServices
import os.log

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem
        let message = request?.userInfo?[SFExtensionMessageKey] as? [String: Any]

        var reply: [String: Any]
        switch message?["type"] as? String {
        case "getToken":
            reply = readToken()
        default:
            reply = ["error": "Unknown message"]
        }

        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: reply]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }

    private func readToken() -> [String: Any] {
        // NSHomeDirectory() is the sandbox container; resolve the real home instead.
        guard let pw = getpwuid(getuid()), let home = pw.pointee.pw_dir else {
            return ["error": "Could not resolve home directory"]
        }
        let path = String(cString: home) + "/.claudecodebrowser/api_token"
        do {
            let token = try String(contentsOfFile: path, encoding: .utf8)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            return token.isEmpty ? ["error": "Token file is empty"] : ["token": token]
        } catch {
            os_log(.error, "ClaudeCodeBrowser: token read failed: %{public}@", error.localizedDescription)
            return ["error": "Token read failed: \(error.localizedDescription). Start the MCP server once to create it."]
        }
    }
}
