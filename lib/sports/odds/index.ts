import { oddsEngine } from "./engine";
import { MockAFLOddsProvider } from "./mockProvider";

export * from "./types";
export * from "./utils";
export * from "./engine";
export * from "./mockProvider";

// Register default providers
oddsEngine.registerProvider(new MockAFLOddsProvider());
