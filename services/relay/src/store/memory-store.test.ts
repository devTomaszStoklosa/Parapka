import { MemoryStore } from "./memory-store.js";
import { runStoreContract } from "./store-contract.js";

runStoreContract("memory", () => new MemoryStore());
