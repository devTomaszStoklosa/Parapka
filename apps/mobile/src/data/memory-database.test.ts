import { describeLocalDatabaseContract } from "./local-database.contract";
import { createMemoryDatabase } from "./memory-database";

describeLocalDatabaseContract("memory", createMemoryDatabase);
