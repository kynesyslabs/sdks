import AbstractionProvidersInstance from "./AbstractionProviders"
import registerAnkrProviders from "./ankr"

// Register the providers
registerAnkrProviders()

// Exporting the singleton instance of the Providers class, already registered with all providers
// Being a const, it should maintain the snapshot of the instance at the time of the import
const Providers = AbstractionProvidersInstance()

export default Providers
