import CryptoKit
import Foundation

let args = CommandLine.arguments
guard args.count == 3, let configuredKey = ProcessInfo.processInfo.environment["DIAO_UPDATE_PUBLIC_KEY"],
      let keyData = Data(base64Encoded: configuredKey),
      let signature = Data(base64Encoded: args[2]) else { throw CocoaError(.fileReadCorruptFile) }
let key = try Curve25519.Signing.PublicKey(rawRepresentation: keyData)
let archive = try Data(contentsOf: URL(fileURLWithPath: args[1]), options: .mappedIfSafe)
guard key.isValidSignature(signature, for: archive) else { throw CocoaError(.fileReadCorruptFile) }
print("Diao update archive signature verified.")
