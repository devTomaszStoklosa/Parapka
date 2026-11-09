import { describeKeyStoreContract } from "./key-store.contract";
import { createMemoryKeyStore } from "./memory-key-store";

describeKeyStoreContract("memory", createMemoryKeyStore);
