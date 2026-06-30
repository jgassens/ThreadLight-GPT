//
//  ViewController.swift
//  Shared (App)
//
//  Created by Jeremiah Gassensmith on 6/29/26.
//

import WebKit

#if os(iOS)
import UIKit
typealias PlatformViewController = UIViewController
#elseif os(macOS)
import Cocoa
import SafariServices
typealias PlatformViewController = NSViewController
#endif

let extensionBundleIdentifier = "com.jeremiahgassensmith.threadlight.Extension"

class ViewController: PlatformViewController, WKNavigationDelegate, WKScriptMessageHandler {

    @IBOutlet var webView: WKWebView!

#if os(macOS)
    private let statusText = NSTextField(labelWithString: "Checking Safari extension status...")
#endif

    override func viewDidLoad() {
        super.viewDidLoad()

#if os(macOS)
        installNativeMacView()
        refreshSafariExtensionState()
#elseif os(iOS)
        self.webView.navigationDelegate = self

        self.webView.scrollView.isScrollEnabled = false

        self.webView.configuration.userContentController.add(self, name: "controller")

        self.webView.loadFileURL(Bundle.main.url(forResource: "Main", withExtension: "html")!, allowingReadAccessTo: Bundle.main.resourceURL!)
#endif
    }

#if os(macOS)
    override func viewDidAppear() {
        super.viewDidAppear()

        guard let window = view.window else { return }
        let size = NSSize(width: 760, height: 560)
        window.minSize = size
        window.maxSize = size
        window.setContentSize(size)
        window.center()
    }
#endif

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
#if os(iOS)
        webView.evaluateJavaScript("show('ios')")
#elseif os(macOS)
        webView.evaluateJavaScript("show('mac')")

        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { (state, error) in
            guard let state = state, error == nil else {
                // Insert code to inform the user that something went wrong.
                return
            }

            DispatchQueue.main.async {
                if #available(macOS 13, *) {
                    webView.evaluateJavaScript("show('mac', \(state.isEnabled), true)")
                } else {
                    webView.evaluateJavaScript("show('mac', \(state.isEnabled), false)")
                }
            }
        }
#endif
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
#if os(macOS)
        if (message.body as! String != "open-preferences") {
            return
        }

        SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { error in
            guard error == nil else {
                // Insert code to inform the user that something went wrong.
                return
            }

            DispatchQueue.main.async {
                NSApp.terminate(self)
            }
        }
#endif
    }

#if os(macOS)
    private func installNativeMacView() {
        preferredContentSize = NSSize(width: 760, height: 560)

        let root = NSView()
        root.translatesAutoresizingMaskIntoConstraints = false
        root.wantsLayer = true
        root.layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor

        let stack = NSStackView()
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.orientation = .vertical
        stack.alignment = .width
        stack.spacing = 18
        root.addSubview(stack)

        let header = NSStackView()
        header.translatesAutoresizingMaskIntoConstraints = false
        header.orientation = .horizontal
        header.alignment = .centerY
        header.spacing = 18
        header.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        if let icon = NSImage(named: "LargeIcon") ?? NSImage(named: "AppIcon") {
            let imageView = NSImageView(image: icon)
            imageView.translatesAutoresizingMaskIntoConstraints = false
            imageView.imageScaling = .scaleProportionallyUpOrDown
            NSLayoutConstraint.activate([
                imageView.widthAnchor.constraint(equalToConstant: 72),
                imageView.heightAnchor.constraint(equalToConstant: 72)
            ])
            header.addArrangedSubview(imageView)
        }

        let titleStack = NSStackView()
        titleStack.translatesAutoresizingMaskIntoConstraints = false
        titleStack.orientation = .vertical
        titleStack.alignment = .width
        titleStack.spacing = 6
        titleStack.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        titleStack.addArrangedSubview(label("ThreadLight", font: .systemFont(ofSize: 34, weight: .bold), color: .labelColor))
        titleStack.addArrangedSubview(wrappingLabel("A local-only Safari extension for keeping long ChatGPT web threads lighter in the current tab.", size: 16))
        header.addArrangedSubview(titleStack)
        stack.addArrangedSubview(header)

        let statusCard = cardStack()
        statusCard.stack.addArrangedSubview(label("Safari extension status", font: .systemFont(ofSize: 12, weight: .bold), color: .secondaryLabelColor))
        statusText.font = .systemFont(ofSize: 15, weight: .regular)
        statusText.textColor = .labelColor
        statusText.lineBreakMode = .byWordWrapping
        statusText.maximumNumberOfLines = 0
        statusCard.stack.addArrangedSubview(statusText)

        let button = NSButton(title: "Open Safari Settings", target: self, action: #selector(openSafariSettings))
        button.bezelStyle = .rounded
        button.controlSize = .regular
        statusCard.stack.addArrangedSubview(button)
        stack.addArrangedSubview(statusCard.container)

        let grid = NSStackView()
        grid.translatesAutoresizingMaskIntoConstraints = false
        grid.orientation = .vertical
        grid.alignment = .width
        grid.spacing = 12
        grid.addArrangedSubview(cardRow([
            infoCard(title: "How It Works", body: "ThreadLight shows only the most recent visible turns from recognized ChatGPT conversation responses. The full conversation remains with ChatGPT."),
            infoCard(title: "Privacy", body: "No analytics, no tracking, no backend server, and no chat content storage. Settings stay local on this device.")
        ]))
        grid.addArrangedSubview(cardRow([
            infoCard(title: "Restore", body: "Use the Safari toolbar popup to restore the full thread for one reload, or disable ThreadLight and reload."),
            infoCard(title: "Access", body: "ThreadLight asks only for ChatGPT web domains: chatgpt.com and chat.openai.com.")
        ]))
        stack.addArrangedSubview(grid)

        stack.addArrangedSubview(wrappingLabel("Unofficial utility. Not affiliated with OpenAI.", size: 13))

        self.view = root

        NSLayoutConstraint.activate([
            root.widthAnchor.constraint(equalToConstant: 760),
            root.heightAnchor.constraint(equalToConstant: 560),
            stack.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 40),
            stack.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -40),
            stack.topAnchor.constraint(equalTo: root.topAnchor, constant: 34)
        ])
    }

    private func refreshSafariExtensionState() {
        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { [weak self] state, error in
            DispatchQueue.main.async {
                if error != nil {
                    self?.statusText.stringValue = "ThreadLight is installed, but macOS could not read the Safari extension state yet."
                    return
                }

                if state?.isEnabled == true {
                    self?.statusText.stringValue = "ThreadLight is enabled in Safari."
                } else {
                    self?.statusText.stringValue = "ThreadLight is installed but not enabled yet."
                }
            }
        }
    }

    @objc private func openSafariSettings() {
        SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { _ in }
    }

    private func label(_ text: String, font: NSFont, color: NSColor) -> NSTextField {
        let field = NSTextField(labelWithString: text)
        field.translatesAutoresizingMaskIntoConstraints = false
        field.font = font
        field.textColor = color
        field.alignment = .left
        field.lineBreakMode = .byWordWrapping
        field.maximumNumberOfLines = 0
        field.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        field.setContentHuggingPriority(.defaultLow, for: .horizontal)
        return field
    }

    private func wrappingLabel(_ text: String, size: CGFloat) -> NSTextField {
        label(text, font: .systemFont(ofSize: size), color: .secondaryLabelColor)
    }

    private func cardStack() -> (container: NSView, stack: NSStackView) {
        let container = NSView()
        container.translatesAutoresizingMaskIntoConstraints = false
        container.wantsLayer = true
        container.layer?.cornerRadius = 8
        container.layer?.borderWidth = 1
        container.layer?.borderColor = NSColor.separatorColor.cgColor
        container.layer?.backgroundColor = NSColor.controlBackgroundColor.cgColor
        container.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        container.setContentHuggingPriority(.defaultLow, for: .horizontal)

        let stack = NSStackView()
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.orientation = .vertical
        stack.alignment = .width
        stack.spacing = 10
        stack.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        stack.setContentHuggingPriority(.defaultLow, for: .horizontal)

        container.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -24),
            stack.topAnchor.constraint(equalTo: container.topAnchor, constant: 18),
            stack.bottomAnchor.constraint(equalTo: container.bottomAnchor, constant: -18)
        ])

        return (container: container, stack: stack)
    }

    private func cardRow(_ cards: [NSView]) -> NSStackView {
        let row = NSStackView(views: cards)
        row.translatesAutoresizingMaskIntoConstraints = false
        row.orientation = .horizontal
        row.alignment = .top
        row.distribution = .fillEqually
        row.spacing = 12
        row.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return row
    }

    private func infoCard(title: String, body: String) -> NSView {
        let card = cardStack()
        card.stack.addArrangedSubview(label(title, font: .systemFont(ofSize: 15, weight: .semibold), color: .labelColor))
        card.stack.addArrangedSubview(wrappingLabel(body, size: 14))
        return card.container
    }
#endif

}
