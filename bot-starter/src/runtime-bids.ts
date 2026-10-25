/** Different auctions must not wait for an older reducer acknowledgement.
 * One request per auction remains serialized, so replacement bids cannot race.
 */
export class AuctionBidDispatcher {
  private readonly pending = new Set<bigint>();
  private closed = false;
  submit(
    auctionId: bigint,
    request: () => Promise<void>,
    success: (elapsedMs: number) => void,
    failure: (error: unknown, elapsedMs: number) => void,
    settled: () => void,
  ): boolean {
    if (this.closed || this.pending.has(auctionId)) return false;
    this.pending.add(auctionId);
    const started = performance.now();
    void Promise.resolve().then(request).then(
      () => { if (!this.closed) success(performance.now() - started); },
      error => { if (!this.closed) failure(error, performance.now() - started); },
    ).finally(() => {
      this.pending.delete(auctionId);
      if (!this.closed) settled();
    });
    return true;
  }
  close(): void { this.closed = true; this.pending.clear(); }
}
