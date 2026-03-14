type CleanupFn = () => Promise<void>;

interface Cleanup {
  name: string;
  fn: CleanupFn;
}

export class ShutdownManager {
  private cleanups: Cleanup[] = [];
  private shutdownStarted = false;

  register(name: string, fn: CleanupFn): void {
    this.cleanups.push({ name, fn });
  }

  listen(): void {
    const handler = () => {
      if (this.shutdownStarted) return;
      this.shutdownStarted = true;
      this.run().then(() => process.exit(0)).catch(() => process.exit(1));
    };

    process.once("SIGTERM", handler);
    process.once("SIGINT", handler);
  }

  async run(): Promise<void> {
    for (const cleanup of this.cleanups) {
      console.log(`shutdown: running ${cleanup.name}`);
      try {
        await cleanup.fn();
      } catch (err) {
        console.error(`shutdown: ${cleanup.name} failed:`, err);
      }
    }
  }
}
