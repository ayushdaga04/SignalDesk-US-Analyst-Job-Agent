import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_STATE = {
  settings: {
    country: "United States",
    freshHours: 24,
    excludeHealthcare: true,
    excludeSecurity: true,
    includeSecondary: true,
    autoArchiveSkips: false
  },
  jobs: [],
  messages: [],
  activity: []
};

export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.writeQueue = Promise.resolve();
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      await fs.access(this.filePath);
    } catch {
      await fs.writeFile(this.filePath, `${JSON.stringify(DEFAULT_STATE, null, 2)}\n`, "utf8");
    }
    return this.read();
  }

  async read() {
    const raw = await fs.readFile(this.filePath, "utf8");
    return { ...structuredClone(DEFAULT_STATE), ...JSON.parse(raw) };
  }

  async write(state) {
    this.writeQueue = this.writeQueue.then(async () => {
      const tempPath = `${this.filePath}.tmp`;
      await fs.writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
      await fs.rename(tempPath, this.filePath);
    });
    await this.writeQueue;
    return state;
  }

  async update(mutator) {
    const state = await this.read();
    const result = await mutator(state);
    await this.write(state);
    return result;
  }
}
