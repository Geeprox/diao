import AppKit
import Darwin
import Security

enum StoreSetup {
    static let hostName = "app.tabpilot.bridge"
    static let applications = URL(fileURLWithPath: "/Applications", isDirectory: true)
    static let bundleIdentifier = "app.diao.bridge"
    static let legacyBundleIdentifier = "app.tabcadence.bridge"
    static let installedVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
    static let legacy = applications.appendingPathComponent("Tab Cadence Bridge.app", isDirectory: true)
    static let current = applications.appendingPathComponent("Diao Bridge.app", isDirectory: true)
    static var isInstalled: Bool { Bundle.main.bundleURL.standardizedFileURL.path == current.standardizedFileURL.path }

    static func registrationOrigins(_ entry: [String: Any], paths: Set<String>, origin: String) throws -> [String] {
        guard entry["name"] as? String == hostName, entry["type"] as? String == "stdio",
              let path = entry["path"] as? String, paths.contains(path),
              let origins = entry["allowed_origins"] as? [String], origins.contains(origin)
        else { throw Failure.connectionConflict }
        return origins
    }

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
        let oldPrograms: Set<String> = [
            legacy.appendingPathComponent("Contents/MacOS/TabPilotBridge").path,
            current.appendingPathComponent("Contents/MacOS/TabPilotBridge").path,
        ]
        let exists = files.fileExists(atPath: target.path)
        var origins = [origin]
        if exists {
            guard try target.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink != true,
                  let entry = try? JSONSerialization.jsonObject(with: Data(contentsOf: target)) as? [String: Any]
            else { throw Failure.connectionConflict }
            origins = try registrationOrigins(entry, paths: oldPrograms.union([program.path]), origin: origin)
            if entry["path"] as? String == program.path { return }
            _ = try checkedBundle(at: Bundle.main.bundleURL)
            if files.fileExists(atPath: legacy.path) {
                _ = try checkedBundle(at: legacy, migrating: true)
                try verifySameSigningIdentity(from: legacy, to: Bundle.main.bundleURL)
            }
        }

        let entry: [String: Any] = [
            "name": hostName,
            "description": "Diao Mac companion",
            "type": "stdio",
            "path": program.path,
            "allowed_origins": origins,
        ]
        let payload = try JSONSerialization.data(withJSONObject: entry, options: [.prettyPrinted, .sortedKeys])
        try payload.write(to: target, options: exists ? [.atomic] : [.withoutOverwriting])
        try files.setAttributes([.posixPermissions: 0o600], ofItemAtPath: target.path)
    }

    static func install() throws -> URL {
        guard CredentialVault.storeBuild, !isInstalled else { throw Failure.incompleteBundle }
        let source = Bundle.main.bundleURL
        let files = FileManager.default
        // 新名称使用标准安装路径，旧应用保留到 Chrome 接续成功后再由用户清理。
        let destination = current
        let existing = files.fileExists(atPath: destination.path)
        if existing || files.fileExists(atPath: legacy.path) {
            let prior = existing ? destination : legacy
            let old = try checkedBundle(at: prior, migrating: true)
            let configured = Bundle.main.object(forInfoDictionaryKey: "DiaoReleaseVersion") as? String
            if old.bundleIdentifier == bundleIdentifier, let configured,
               let version = old.object(forInfoDictionaryKey: "DiaoReleaseVersion") as? String {
                let order = configured.compare(version, options: .numeric)
                let oldBuild = old.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
                if order == .orderedAscending ||
                   order == .orderedSame && installedVersion.compare(oldBuild, options: .numeric) != .orderedDescending { return prior }
            }
            if old.object(forInfoDictionaryKey: "DiaoReleaseVersion") == nil {
                let version = old.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
                guard installedVersion.compare(version, options: .numeric) != .orderedAscending else { return prior }
            }
            try verifySameSigningIdentity(from: prior, to: source)
        }
        _ = try checkedBundle(at: source)
        let running = [bundleIdentifier, legacyBundleIdentifier]
            .flatMap(NSRunningApplication.runningApplications(withBundleIdentifier:))
            .filter { $0.bundleURL?.standardizedFileURL.path == destination.standardizedFileURL.path }
        try replace(from: source, at: destination, hasExisting: existing)
        for application in running { application.terminate() }
        return destination
    }

    private static func checkedBundle(at url: URL, migrating: Bool = false) throws -> Bundle {
        guard try url.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink != true,
              let bundle = Bundle(url: url), bundle.bundleIdentifier == bundleIdentifier ||
                  migrating && bundle.bundleIdentifier == legacyBundleIdentifier,
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
        guard SecStaticCodeCreateWithPath(next as CFURL, [], &after) == errSecSuccess, let after
        else { throw Failure.foreignBundle }
        if Bundle(url: old)?.bundleIdentifier == legacyBundleIdentifier,
           Bundle(url: next)?.bundleIdentifier == bundleIdentifier {
            // 改名换标识时，仍要求新旧签名来自同一发布团队。
            guard SecCodeCopySigningInformation(after, SecCSFlags(rawValue: kSecCSSigningInformation), &info) == errSecSuccess,
                  let incoming = info as? [String: Any],
                  incoming[kSecCodeInfoTeamIdentifier as String] as? String == team
            else { throw Failure.foreignBundle }
        } else {
            guard SecCodeCopyDesignatedRequirement(before, [], &requirement) == errSecSuccess,
                  SecStaticCodeCheckValidity(after, [], requirement) == errSecSuccess else { throw Failure.foreignBundle }
        }
    }
    static func migrationSelfTest() throws {
        let origin = "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/"
        let old = legacy.appendingPathComponent("Contents/MacOS/TabPilotBridge").path
        let next = current.appendingPathComponent("Contents/MacOS/DiaoBridge").path
        let origins = [origin, "chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/"]
        let entry: [String: Any] = ["name":hostName, "type":"stdio", "path":old, "allowed_origins":origins]
        let preserved = try registrationOrigins(entry, paths:[old, next], origin:origin)
        guard preserved == origins else { throw Failure.connectionConflict }
        var foreign = entry
        foreign["path"] = "/Applications/Unrelated.app/Contents/MacOS/App"
        do {
            _ = try registrationOrigins(foreign, paths:[old, next], origin:origin)
        } catch Failure.connectionConflict {
            return
        }
        throw Failure.connectionConflict
    }

}
