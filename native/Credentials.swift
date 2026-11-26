import Foundation
import AppKit
import Security
import Darwin
import CryptoKit

struct StoredCredential:Codable {let version:Int;let origin:String;let apiKey:String}
enum CredentialError:Error {case invalid,forbidden,locked,unstableSigning,migrationRequired,failed(OSStatus)}
struct KeychainCredentialStore {
    let service:String
    func query(_ scope:String)->[String:Any] {[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:service,kSecAttrAccount as String:scope]}
    func save(_ scope:String,origin:String,key:String,onlyIfMissing:Bool=false) throws {
        var query=query(scope)
        let data=try JSONEncoder().encode(StoredCredential(version:1,origin:origin,apiKey:key))
        let values:[String:Any]=[kSecValueData as String:data,kSecAttrLabel as String:"Tab Pilot · "+(URL(string:origin)?.host ?? "API")]
        var status:OSStatus
        if onlyIfMissing {query.merge(values){_,new in new};status=SecItemAdd(query as CFDictionary,nil);if status==errSecDuplicateItem{return}}
        else{status=SecItemUpdate(query as CFDictionary,values as CFDictionary);if status==errSecItemNotFound {query.merge(values){_,new in new};status=SecItemAdd(query as CFDictionary,nil)}}
        guard status==errSecSuccess else{throw CredentialError.failed(status)}
    }
    func load(_ scope:String,origin:String) throws -> StoredCredential? {
        var query=query(scope);query[kSecReturnData as String]=true;query[kSecMatchLimit as String]=kSecMatchLimitOne
        var result:CFTypeRef?;let status=SecItemCopyMatching(query as CFDictionary,&result)
        if status==errSecItemNotFound{return nil}
        guard status==errSecSuccess else{throw CredentialError.failed(status)}
        guard let data=result as? Data,let record=try? JSONDecoder().decode(StoredCredential.self,from:data),record.version==1,CredentialVault.validKey(record.apiKey),CredentialVault.validOrigin(record.origin) else{throw CredentialError.invalid}
        return record.origin==origin ? record:nil
    }
    func exists(_ scope:String) throws -> Bool {
        var query=query(scope);query[kSecReturnAttributes as String]=true;query[kSecReturnData as String]=false;query[kSecMatchLimit as String]=kSecMatchLimitOne
        let status=SecItemCopyMatching(query as CFDictionary,nil)
        if status==errSecItemNotFound{return false};guard status==errSecSuccess else{throw CredentialError.failed(status)};return true
    }
    func delete(_ scope:String) throws {
        let status=SecItemDelete(query(scope) as CFDictionary)
        guard status==errSecSuccess||status==errSecItemNotFound else{throw CredentialError.failed(status)}
    }
}
// 旧条目只做一次交互读取；新条目由稳定身份新建，避免继续继承旧 ACL。
func restoreStoredCredential(current:KeychainCredentialStore,legacy:KeychainCredentialStore,scope:String,origin:String,interactive:Bool) throws -> (record:StoredCredential?,migrated:Bool) {
    if let record=try current.load(scope,origin:origin){return(record,false)}
    guard try legacy.exists(scope) else{return(nil,false)}
    guard interactive else{throw CredentialError.migrationRequired}
    guard CredentialVault.stableCodeIdentity() else{throw CredentialError.unstableSigning}
    guard let old=try legacy.load(scope,origin:origin) else{return(nil,false)}
    try current.save(scope,origin:origin,key:old.apiKey,onlyIfMissing:true)
    guard let saved=try current.load(scope,origin:origin) else{throw CredentialError.invalid}
    return(saved,true)
}
final class CredentialVault {
    static let storeBuild = Bundle.main.bundleIdentifier == StoreSetup.bundleIdentifier
    static let service = storeBuild ? "app.tabcadence.api-key.v2" : "app.tabpilot.api-key.v2"
    static let legacyService = storeBuild ? "app.tabcadence.api-key" : "app.tabpilot.api-key"
    static let extensionOrigin: String? = {
        if !storeBuild { return "chrome-extension://gpbocpjbblpcipecnicfjdcbedpaipoi/" }
        // 商店扩展身份随签名包一起分发。缺失或无效配置时拒绝访问钥匙串。
        guard let id = Bundle.main.object(forInfoDictionaryKey: "TabCadenceStoreExtensionID") as? String,
              id.utf8.count == 32, id.utf8.allSatisfy({ (97...112).contains($0) }) else { return nil }
        return "chrome-extension://"+id+"/"
    }()
    let queue=DispatchQueue(label:"app.tabpilot.credentials",qos:.userInitiated)
    static func validScope(_ value:String)->Bool {UUID(uuidString:value) != nil && value.count==36}
    static func validOrigin(_ value:String)->Bool {
        guard value.count<=400,value.hasPrefix("https://"),let c=URLComponents(string:value),c.scheme=="https",let host=c.host,!host.isEmpty,c.user==nil,c.password==nil,c.query==nil,c.fragment==nil,c.path.isEmpty else{return false}
        return c.port.map{(1...65535).contains($0)} ?? true
    }
    static func validKey(_ key:String)->Bool {!key.isEmpty && key.count<=512 && !key.contains(where:{$0=="\n"||$0=="\r"||$0=="\0"})}
    static func signedChrome(_ pid:pid_t)->Bool {
        var code:SecCode?,requirement:SecRequirement?
        guard SecCodeCopyGuestWithAttributes(nil,[kSecGuestAttributePid:pid] as CFDictionary,SecCSFlags(),&code)==errSecSuccess,let code=code else{return false}
        let rule = #"anchor apple generic and identifier "com.google.Chrome" and certificate leaf[subject.OU] = "EQHXZ8M8AV""#
        guard SecRequirementCreateWithString(rule as CFString,SecCSFlags(),&requirement)==errSecSuccess,let requirement=requirement else{return false}
        return SecCodeCheckValidity(code,SecCSFlags(),requirement)==errSecSuccess
    }
    static func stableCodeIdentity()->Bool {
        var code:SecCode?,staticCode:SecStaticCode?,info:CFDictionary?
        guard SecCodeCopySelf(SecCSFlags(),&code)==errSecSuccess,let code=code,SecCodeCopyStaticCode(code,SecCSFlags(),&staticCode)==errSecSuccess,let staticCode=staticCode,SecCodeCopySigningInformation(staticCode,SecCSFlags(rawValue:kSecCSSigningInformation),&info)==errSecSuccess,let values=info as? [String:Any] else{return false}
        let flags=(values[kSecCodeInfoFlags as String] as? NSNumber)?.uint32Value ?? 0
        return flags & SecCodeSignatureFlags.adhoc.rawValue == 0 && !(values[kSecCodeInfoTeamIdentifier as String] as? String ?? "").isEmpty
    }
    static func trustedCaller()->Bool {
        guard let extensionOrigin else { return false }
        return CommandLine.arguments.contains(extensionOrigin) && signedChrome(getppid())
    }
    static func query(_ scope:String)->[String:Any] {[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:service,kSecAttrAccount as String:scope]}
    // 仅记录操作结果，便于核对真实重载恢复；不记录密钥、正文、网址或原始安装标识。
    func recordHealth(scope:String,type:String,interactive:Bool,result:[String:Any]) {
        let base=FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(Self.storeBuild ? "Library/Application Support/TabCadence" : "Library/Application Support/TabPilot",isDirectory:true)
        let url=base.appendingPathComponent("credential-health.json"),lockURL=base.appendingPathComponent("credential-health.lock")
        guard (try? base.resourceValues(forKeys:[.isSymbolicLinkKey]).isSymbolicLink) != true,(try? url.resourceValues(forKeys:[.isSymbolicLinkKey]).isSymbolicLink) != true else{return}
        guard let lock=open(lockURL.path,O_CREAT|O_RDWR|O_NOFOLLOW,0o600) as Int32?,lock>=0 else{return}
        defer{close(lock)};guard flock(lock,LOCK_EX|LOCK_NB)==0 else{return};defer{flock(lock,LOCK_UN)}
        let now=Date().timeIntervalSince1970
        var events=((try? Data(contentsOf:url)).flatMap{try? JSONSerialization.jsonObject(with:$0) as? [[String:Any]]} ?? []).filter{now-($0["at"] as? Double ?? 0)<14*86400}
        var event:[String:Any]=["at":now,"operation":String(type.dropFirst("credential.".count)),"interactive":interactive,"ok":result["ok"] as? Bool ?? false,"version":Bundle.main.object(forInfoDictionaryKey:"CFBundleShortVersionString") as? String ?? "unknown","build":Bundle.main.object(forInfoDictionaryKey:"CFBundleVersion") as? String ?? "unknown","profile":SHA256.hash(data:Data(scope.utf8)).prefix(8).map{String(format:"%02x",$0)}.joined(),"stableIdentity":Self.stableCodeIdentity(),"caller":"signedChrome"]
        for key in ["found","saved","migrated","storage","code","status"] {if let value=result[key]{event[key]=value}}
        events.append(event);events=Array(events.suffix(16))
        if let data=try? JSONSerialization.data(withJSONObject:events,options:.sortedKeys){try? data.write(to:url,options:.atomic);try? FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:url.path)}
    }
    func perform(_ object:[String:Any],reply:@escaping([String:Any])->Void){
        guard let id=object["requestId"] as? String,id.count<=64,!id.isEmpty else{return}
        guard Self.trustedCaller() else{reply(["type":"credentialResult","requestId":id,"ok":false,"error":"只有当前 Tab Pilot 的 Chrome 原生连接可以访问钥匙串。","code":"forbidden"]);return}
        if Self.storeBuild && !Self.stableCodeIdentity() {
            reply(["type":"credentialResult","requestId":id,"ok":false,"code":"unstable_signing",
                   "error":"手动信任版仅支持当前 Chrome 会话的 API 连接。"])
            return
        }
        guard let scope=object["scope"] as? String,Self.validScope(scope),let type=object["type"] as? String,["credential.save","credential.load","credential.delete"].contains(type) else{reply(["type":"credentialResult","requestId":id,"ok":false,"error":"连接保存请求无效。","code":"invalid"]);return}
        queue.async {
            var response:[String:Any]=["type":"credentialResult","requestId":id,"ok":true]
            var previous:DarwinBoolean=true
            let previousStatus=SecKeychainGetUserInteractionAllowed(&previous)
            let interactive=object["interactive"] as? Bool == true
            var changedPolicy=false
            defer{if changedPolicy {_=SecKeychainSetUserInteractionAllowed(previous.boolValue)};self.recordHealth(scope:scope,type:type,interactive:interactive,result:response);let result=response;DispatchQueue.main.async{reply(result)}}
            do {
                guard previousStatus==errSecSuccess else{throw CredentialError.failed(previousStatus)}
                let policyStatus=SecKeychainSetUserInteractionAllowed(interactive);guard policyStatus==errSecSuccess else{throw CredentialError.failed(policyStatus)};changedPolicy=true
                let store=KeychainCredentialStore(service:Self.service),legacy=KeychainCredentialStore(service:Self.legacyService)
                response["storage"]="stable-v2"
                if type=="credential.save" {
                    guard Self.stableCodeIdentity() else{throw CredentialError.unstableSigning}
                    guard let origin=object["origin"] as? String,Self.validOrigin(origin),let key=object["apiKey"] as? String,Self.validKey(key) else{throw CredentialError.invalid}
                    try store.save(scope,origin:origin,key:key)
                    guard let saved=try store.load(scope,origin:origin),saved.apiKey==key else{throw CredentialError.invalid}
                    response["saved"]=true
                }else if type=="credential.load" {
                    guard let origin=object["origin"] as? String,Self.validOrigin(origin) else{throw CredentialError.invalid}
                    let restored=try restoreStoredCredential(current:store,legacy:legacy,scope:scope,origin:origin,interactive:interactive)
                    guard let record=restored.record else{response["found"]=false;return}
                    response["found"]=true;response["origin"]=origin;response["apiKey"]=record.apiKey;response["migrated"]=restored.migrated
                }else{try legacy.delete(scope);try store.delete(scope)}
            }catch{
                response["ok"]=false;response["code"]="keychain_unavailable"
                if case CredentialError.unstableSigning=error {
                    response["code"]="unstable_signing";response["error"]="当前辅助程序使用临时签名，无法保证更新后恢复连接。请更新为稳定签名版本。"
                }else if case CredentialError.migrationRequired=error {
                    response["code"]="keychain_migration_required";response["requiresInteraction"]=true
                    response["error"]="旧版连接需要迁移一次。选择“解锁并恢复连接”即可在本机完成，以后重载自动恢复；无需重新导入。"
                }else if case CredentialError.failed(let status)=error {
                    response["status"]=status
                    if status==errSecAuthFailed||status==errSecInteractionNotAllowed||status==errSecUserCanceled {
                        response["code"]="keychain_auth_required";response["requiresInteraction"]=true
                        response["error"]="macOS 需要确认钥匙串访问。选择“解锁并恢复连接”，在系统对话框允许 Tab Pilot；无需重新导入密钥。"
                    }else{response["error"]="macOS 钥匙串暂时不可用。解锁这台 Mac 后恢复连接，无需重新导入密钥。"}
                }else{response["error"]="钥匙串连接数据无效，未读取或保存密钥。"}

            }
        }
    }
}
func credentialSelfTest() throws {
    guard CredentialVault.validScope("1131D3C2-7063-4B53-BF95-573B17D6EC04"),!CredentialVault.validScope("other"),CredentialVault.validOrigin("https://api.openai.com"),!CredentialVault.validOrigin("http://api.openai.com"),!CredentialVault.validOrigin("https://user:pass@api.openai.com"),!CredentialVault.validOrigin("https://api.openai.com/v1"),!CredentialVault.validKey("bad\nkey"),!CredentialVault.trustedCaller() else{throw CredentialError.invalid}
    if let chrome=NSRunningApplication.runningApplications(withBundleIdentifier:"com.google.Chrome").first {guard CredentialVault.signedChrome(chrome.processIdentifier) else{throw CredentialError.forbidden}}
    // Probe only a fresh, nonexistent account. Never read an existing credential or write a test key.
    var previous:DarwinBoolean=true
    let got=SecKeychainGetUserInteractionAllowed(&previous);guard got==errSecSuccess else{throw CredentialError.failed(got)}
    guard SecKeychainSetUserInteractionAllowed(false)==errSecSuccess else{throw CredentialError.locked}
    defer{_=SecKeychainSetUserInteractionAllowed(previous.boolValue)}
    let probe=SecItemCopyMatching(CredentialVault.query(UUID().uuidString) as CFDictionary,nil)
    guard probe==errSecItemNotFound||probe==errSecInteractionNotAllowed else{throw CredentialError.failed(probe)}
    let record=StoredCredential(version:1,origin:"https://api.openai.com",apiKey:"synthetic-local-key")
    guard try JSONDecoder().decode(StoredCredential.self,from:JSONEncoder().encode(record)).origin==record.origin else{throw CredentialError.invalid}
}

// 此探针固定使用独立的合成服务，命令行不能选择或读取生产密钥。
func credentialRoundtripProbe(_ action:String,scope:String) throws -> [String:Any] {
    guard CredentialVault.validScope(scope),["create","read","delete"].contains(action) else{throw CredentialError.invalid}
    var previous:DarwinBoolean=true
    guard SecKeychainGetUserInteractionAllowed(&previous)==errSecSuccess,SecKeychainSetUserInteractionAllowed(false)==errSecSuccess else{throw CredentialError.locked}
    defer{_=SecKeychainSetUserInteractionAllowed(previous.boolValue)}
    let store=KeychainCredentialStore(service:"app.tabpilot.api-key.selftest"),origin="https://keychain-selftest.invalid",key="synthetic-"+scope
    if action=="create" {
        guard CredentialVault.stableCodeIdentity(),try store.load(scope,origin:origin)==nil else{throw CredentialError.invalid}
        try store.save(scope,origin:origin,key:key)
    }else if action=="read" {
        guard let record=try store.load(scope,origin:origin),record.apiKey==key else{throw CredentialError.invalid}
    }else{try store.delete(scope)}
    var report:[String:Any]=["ok":true,"action":action,"stableIdentity":CredentialVault.stableCodeIdentity()]
    #if TABPILOT_KEYCHAIN_PROBE_VARIANT
    report["probeRevision"]=2
    #else
    report["probeRevision"]=1
    #endif
    return report
}

// 迁移探针只访问两项固定的合成服务，不能指定生产服务或返回密钥值。
func credentialMigrationProbe(_ action:String,scope:String) throws -> [String:Any] {
    guard CredentialVault.validScope(scope),["create","needs-migration","migrate","read","delete"].contains(action) else{throw CredentialError.invalid}
    var previous:DarwinBoolean=true;guard SecKeychainGetUserInteractionAllowed(&previous)==errSecSuccess,SecKeychainSetUserInteractionAllowed(false)==errSecSuccess else{throw CredentialError.locked};defer{_=SecKeychainSetUserInteractionAllowed(previous.boolValue)}
    let legacy=KeychainCredentialStore(service:"app.tabpilot.api-key.selftest.migration.legacy"),current=KeychainCredentialStore(service:"app.tabpilot.api-key.selftest.migration.stable"),origin="https://keychain-selftest.invalid",key="synthetic-"+scope
    if action=="create"{guard try !legacy.exists(scope),try !current.exists(scope) else{throw CredentialError.invalid};try legacy.save(scope,origin:origin,key:key)}
    else if action=="needs-migration"{do{_=try restoreStoredCredential(current:current,legacy:legacy,scope:scope,origin:origin,interactive:false);throw CredentialError.invalid}catch CredentialError.migrationRequired{}}
    else if action=="migrate"{let result=try restoreStoredCredential(current:current,legacy:legacy,scope:scope,origin:origin,interactive:true);guard result.migrated,result.record?.apiKey==key,try legacy.exists(scope) else{throw CredentialError.invalid}}
    else if action=="read"{let result=try restoreStoredCredential(current:current,legacy:legacy,scope:scope,origin:origin,interactive:false);guard !result.migrated,result.record?.apiKey==key else{throw CredentialError.invalid}}
    else{try legacy.delete(scope);try current.delete(scope);guard try !legacy.exists(scope),try !current.exists(scope) else{throw CredentialError.invalid}}
    return ["ok":true,"action":action,"syntheticOnly":true]
}
