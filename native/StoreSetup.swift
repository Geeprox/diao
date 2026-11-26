import AppKit
import Darwin
import Security

enum StoreSetup {
    static let hostName = "app.tabpilot.bridge"
    static let applications = URL(fileURLWithPath: "/Applications", isDirectory: true)
    static let bundleIdentifier = "app.tabcadence.bridge"
    static let installedVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
    static var isInstalled: Bool { Bundle.main.bundleURL.deletingLastPathComponent().standardizedFileURL.path == applications.path }

    enum Failure: Error {
        case needsInstallation
        case incompleteBundle
        case connectionConflict
        case foreignBundle
        case replacementFailed
    }

    static func register() throws {
        guard CredentialVault.storeBuild, let origin = CredentialVault.extensionOrigin,
              let program = Bundle.main.executableURL, FileManager.default.isExecutableFile(atPath: program.path)
        else { throw Failure.incompleteBundle }
        guard isInstalled
        else { throw Failure.needsInstallation }

        let files = FileManager.default
        let folder = try files.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                   appropriateFor: nil, create: true)
            .appendingPathComponent("Google/Chrome/NativeMessagingHosts", isDirectory: true)
        try files.createDirectory(at: folder, withIntermediateDirectories: true)
        let target = folder.appendingPathComponent(hostName + ".json")
        if files.fileExists(atPath: target.path) {
            guard try target.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink != true,
                  let entry = try? JSONSerialization.jsonObject(with: Data(contentsOf: target)) as? [String: Any],
                  entry["name"] as? String == hostName, entry["type"] as? String == "stdio",
                  entry["path"] as? String == program.path, entry["allowed_origins"] as? [String] == [origin]
            else { throw Failure.connectionConflict }
            return
        }

        let entry: [String: Any] = [
            "name": hostName,
            "description": "Diao Mac companion",
            "type": "stdio",
            "path": program.path,
            "allowed_origins": [origin],
        ]
        let payload = try JSONSerialization.data(withJSONObject: entry, options: [.prettyPrinted, .sortedKeys])
        try payload.write(to: target, options: [.withoutOverwriting])
        try files.setAttributes([.posixPermissions: 0o600], ofItemAtPath: target.path)
    }

    static func install() throws -> URL {
        guard CredentialVault.storeBuild, !isInstalled else { throw Failure.incompleteBundle }
        let source = Bundle.main.bundleURL
        let files = FileManager.default
        let legacy = applications.appendingPathComponent("Tab Cadence Bridge.app", isDirectory: true)
        let current = applications.appendingPathComponent("Diao Bridge.app", isDirectory: true)
        // 已登记的旧版继续使用同一路径，Chrome 无需改动原生消息注册。
        let destination = files.fileExists(atPath: legacy.path) ? legacy : current
        let existing = files.fileExists(atPath: destination.path)
        if existing {
            let old = try checkedBundle(at: destination)
            let configured = Bundle.main.object(forInfoDictionaryKey: "DiaoReleaseVersion") as? String
            if let configured, let version = old.object(forInfoDictionaryKey: "DiaoReleaseVersion") as? String,
               configured.compare(version, options: .numeric) != .orderedDescending { return destination }
            if old.object(forInfoDictionaryKey: "DiaoReleaseVersion") == nil {
                let version = old.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
                guard installedVersion.compare(version, options: .numeric) != .orderedAscending else { return destination }
            }
            try verifySameSigningIdentity(from: destination, to: source)
        }
        _ = try checkedBundle(at: source)
        let running = NSRunningApplication.runningApplications(withBundleIdentifier: bundleIdentifier).filter {
            $0.bundleURL?.standardizedFileURL.path == destination.standardizedFileURL.path
        }
        try replace(from: source, at: destination, hasExisting: existing)
        for application in running { application.terminate() }
        return destination
    }

    private static func checkedBundle(at url: URL) throws -> Bundle {
        guard try url.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink != true,
              let bundle = Bundle(url: url), bundle.bundleIdentifier == bundleIdentifier,
              let origin = CredentialVault.extensionOrigin,
              let id = bundle.object(forInfoDictionaryKey: "TabCadenceStoreExtensionID") as? String,
              origin == "chrome-extension://"+id+"/" else { throw Failure.foreignBundle }
        var signed: SecStaticCode?
        guard SecStaticCodeCreateWithPath(url as CFURL, [], &signed) == errSecSuccess,
              let signed, SecStaticCodeCheckValidity(signed, SecCSFlags(rawValue: kSecCSStrictValidate | kSecCSCheckNestedCode), nil) == errSecSuccess
        else { throw Failure.incompleteBundle }
        return bundle
    }

    // 在目标磁盘完成复制和签名核对，最后一次原子交换目录。旧进程可以正常释放，无需强杀。
    static func replace(from source: URL, at destination: URL, hasExisting: Bool) throws {
        let files = FileManager.default
        let scratch = try files.url(for: .itemReplacementDirectory, in: .userDomainMask,
                                    appropriateFor: destination.deletingLastPathComponent(), create: true)
        defer { try? files.removeItem(at: scratch) }
        let replacement = scratch.appendingPathComponent(destination.lastPathComponent, isDirectory: true)
        try files.copyItem(at: source, to: replacement)
        _ = try checkedBundle(at: replacement)
        if hasExisting {
            guard renamex_np(replacement.path, destination.path, UInt32(RENAME_SWAP)) == 0
            else { throw Failure.replacementFailed }
        } else {
            try files.moveItem(at: replacement, to: destination)
        }
    }

    private static func verifySameSigningIdentity(from old: URL, to next: URL) throws {
        var before: SecStaticCode?, after: SecStaticCode?, info: CFDictionary?, requirement: SecRequirement?
        guard SecStaticCodeCreateWithPath(old as CFURL, [], &before) == errSecSuccess, let before,
              SecCodeCopySigningInformation(before, SecCSFlags(rawValue: kSecCSSigningInformation), &info) == errSecSuccess,
              let values = info as? [String: Any] else { throw Failure.incompleteBundle }
        guard let team = values[kSecCodeInfoTeamIdentifier as String] as? String, !team.isEmpty else { return }
        guard SecCodeCopyDesignatedRequirement(before, [], &requirement) == errSecSuccess,
              SecStaticCodeCreateWithPath(next as CFURL, [], &after) == errSecSuccess, let after,
              SecStaticCodeCheckValidity(after, [], requirement) == errSecSuccess else { throw Failure.foreignBundle }
    }
}
