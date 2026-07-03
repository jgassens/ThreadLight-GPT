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
    private let statusIndicator = NSView()
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
        stack.alignment = .centerX
        stack.spacing = 10
        root.addSubview(stack)

        let iconView = splashIconView()
        let title = label("ThreadLight", font: .systemFont(ofSize: 32, weight: .bold), color: .labelColor, alignment: .center)
        let subtitle = label(
            "Keeps long ChatGPT threads usable in Safari by showing only the recent visible turns in the current tab.",
            font: .systemFont(ofSize: 15, weight: .regular),
            color: .secondaryLabelColor,
            alignment: .center
        )
        subtitle.maximumNumberOfLines = 2

        let statusCard = statusSection()
        let featureGrid = featureGrid()
        let footer = label(
            "Unofficial utility. Not affiliated with OpenAI.",
            font: .systemFont(ofSize: 12, weight: .regular),
            color: .tertiaryLabelColor,
            alignment: .center
        )

        [iconView, title, subtitle, statusCard, featureGrid, footer].forEach(stack.addArrangedSubview)
        stack.setCustomSpacing(8, after: iconView)
        stack.setCustomSpacing(4, after: title)
        stack.setCustomSpacing(16, after: subtitle)
        stack.setCustomSpacing(16, after: statusCard)
        stack.setCustomSpacing(12, after: featureGrid)

        self.view = root

        NSLayoutConstraint.activate([
            root.widthAnchor.constraint(equalToConstant: 760),
            root.heightAnchor.constraint(equalToConstant: 560),
            stack.widthAnchor.constraint(equalToConstant: 608),
            stack.centerXAnchor.constraint(equalTo: root.centerXAnchor),
            stack.topAnchor.constraint(equalTo: root.topAnchor, constant: 30),
            stack.bottomAnchor.constraint(lessThanOrEqualTo: root.bottomAnchor, constant: -26),
            subtitle.widthAnchor.constraint(equalTo: stack.widthAnchor),
            statusCard.widthAnchor.constraint(equalTo: stack.widthAnchor),
            featureGrid.widthAnchor.constraint(equalTo: stack.widthAnchor),
            footer.widthAnchor.constraint(equalTo: stack.widthAnchor)
        ])
    }

    private func refreshSafariExtensionState() {
        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { [weak self] state, error in
            DispatchQueue.main.async {
                if error != nil {
                    self?.statusText.stringValue = "ThreadLight is installed, but macOS could not read the Safari extension state yet."
                    self?.setStatusIndicator(.systemGray)
                    return
                }

                if state?.isEnabled == true {
                    self?.statusText.stringValue = "ThreadLight is enabled in Safari."
                    self?.setStatusIndicator(.systemGreen)
                } else {
                    self?.statusText.stringValue = "ThreadLight is installed but not enabled yet."
                    self?.setStatusIndicator(.systemOrange)
                }
            }
        }
    }

    @objc private func openSafariSettings() {
        SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { _ in }
    }

    private func splashIconView() -> NSView {
        let imageView = NSImageView()
        imageView.translatesAutoresizingMaskIntoConstraints = false
        imageView.image = NSImage(named: "LargeIcon") ?? NSImage(named: "AppIcon")
        imageView.imageScaling = .scaleProportionallyUpOrDown
        imageView.wantsLayer = true
        imageView.layer?.cornerRadius = 20
        imageView.layer?.masksToBounds = true
        imageView.setContentHuggingPriority(.required, for: .horizontal)
        imageView.setContentHuggingPriority(.required, for: .vertical)

        NSLayoutConstraint.activate([
            imageView.widthAnchor.constraint(equalToConstant: 96),
            imageView.heightAnchor.constraint(equalToConstant: 96)
        ])

        return imageView
    }

    private func statusSection() -> NSView {
        let card = cardStack(padding: 18)
        let row = NSStackView()
        row.translatesAutoresizingMaskIntoConstraints = false
        row.orientation = .horizontal
        row.alignment = .centerY
        row.spacing = 14

        statusIndicator.translatesAutoresizingMaskIntoConstraints = false
        statusIndicator.wantsLayer = true
        statusIndicator.layer?.cornerRadius = 5
        statusIndicator.layer?.backgroundColor = NSColor.systemGray.cgColor
        NSLayoutConstraint.activate([
            statusIndicator.widthAnchor.constraint(equalToConstant: 10),
            statusIndicator.heightAnchor.constraint(equalToConstant: 10)
        ])

        let textStack = NSStackView()
        textStack.translatesAutoresizingMaskIntoConstraints = false
        textStack.orientation = .vertical
        textStack.alignment = .width
        textStack.spacing = 3
        textStack.addArrangedSubview(label("Safari Extension", font: .systemFont(ofSize: 13, weight: .semibold), color: .labelColor))

        statusText.font = .systemFont(ofSize: 13, weight: .regular)
        statusText.textColor = .secondaryLabelColor
        statusText.lineBreakMode = .byWordWrapping
        statusText.maximumNumberOfLines = 2
        statusText.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        textStack.addArrangedSubview(statusText)

        let button = NSButton(title: "Open Safari Settings", target: self, action: #selector(openSafariSettings))
        button.bezelStyle = .rounded
        button.controlSize = .regular
        button.setContentHuggingPriority(.required, for: .horizontal)

        row.addArrangedSubview(statusIndicator)
        row.addArrangedSubview(textStack)
        row.addArrangedSubview(button)
        card.stack.addArrangedSubview(row)

        return card.container
    }

    private func setStatusIndicator(_ color: NSColor) {
        statusIndicator.layer?.backgroundColor = color.cgColor
    }

    private func featureGrid() -> NSView {
        let grid = NSStackView()
        grid.translatesAutoresizingMaskIntoConstraints = false
        grid.orientation = .vertical
        grid.alignment = .width
        grid.spacing = 10
        grid.addArrangedSubview(cardRow([
            featureTile(symbolName: "line.3.horizontal.decrease.circle", title: "Lighter threads", body: "Shows recent visible turns so very long conversations stay responsive."),
            featureTile(symbolName: "lock.shield", title: "Local-only", body: "No analytics, backend service, remote config, or chat-content storage.")
        ]))
        grid.addArrangedSubview(cardRow([
            featureTile(symbolName: "arrow.counterclockwise", title: "Easy restore", body: "Restore the full thread for one reload from the Safari toolbar popup."),
            featureTile(symbolName: "safari", title: "Limited access", body: "Runs only on chatgpt.com and chat.openai.com.")
        ]))

        return grid
    }

    private func label(
        _ text: String,
        font: NSFont,
        color: NSColor,
        alignment: NSTextAlignment = .left
    ) -> NSTextField {
        let field = NSTextField(labelWithString: text)
        field.translatesAutoresizingMaskIntoConstraints = false
        field.font = font
        field.textColor = color
        field.alignment = alignment
        field.lineBreakMode = .byWordWrapping
        field.maximumNumberOfLines = 0
        field.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        field.setContentHuggingPriority(.defaultLow, for: .horizontal)
        return field
    }

    private func wrappingLabel(_ text: String, size: CGFloat) -> NSTextField {
        label(text, font: .systemFont(ofSize: size), color: .secondaryLabelColor)
    }

    private func cardStack(padding: CGFloat = 16) -> (container: NSView, stack: NSStackView) {
        let container = NSView()
        container.translatesAutoresizingMaskIntoConstraints = false
        container.wantsLayer = true
        container.layer?.cornerRadius = 8
        container.layer?.borderWidth = 1
        container.layer?.borderColor = NSColor.separatorColor.withAlphaComponent(0.55).cgColor
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
            stack.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: padding),
            stack.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -padding),
            stack.topAnchor.constraint(equalTo: container.topAnchor, constant: padding),
            stack.bottomAnchor.constraint(equalTo: container.bottomAnchor, constant: -padding)
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

    private func featureTile(symbolName: String, title: String, body: String) -> NSView {
        let card = cardStack()
        let header = NSStackView()
        header.translatesAutoresizingMaskIntoConstraints = false
        header.orientation = .horizontal
        header.alignment = .centerY
        header.spacing = 8

        if #available(macOS 11.0, *), let image = NSImage(systemSymbolName: symbolName, accessibilityDescription: nil) {
            image.isTemplate = true
            let iconView = NSImageView(image: image)
            iconView.translatesAutoresizingMaskIntoConstraints = false
            iconView.contentTintColor = .controlAccentColor
            NSLayoutConstraint.activate([
                iconView.widthAnchor.constraint(equalToConstant: 18),
                iconView.heightAnchor.constraint(equalToConstant: 18)
            ])
            header.addArrangedSubview(iconView)
        }

        header.addArrangedSubview(label(title, font: .systemFont(ofSize: 13, weight: .semibold), color: .labelColor))
        card.stack.addArrangedSubview(header)

        let bodyLabel = label(body, font: .systemFont(ofSize: 12, weight: .regular), color: .secondaryLabelColor)
        bodyLabel.maximumNumberOfLines = 3
        card.stack.addArrangedSubview(bodyLabel)

        NSLayoutConstraint.activate([
            card.container.heightAnchor.constraint(greaterThanOrEqualToConstant: 86)
        ])

        return card.container
    }
#endif

}
