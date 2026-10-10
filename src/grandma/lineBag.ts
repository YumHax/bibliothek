import { random, shuffled } from '@/random';

/**
 * A line at a time from a list, drawn like cards from a shuffled deck: every line once before any comes back, and
 * never the same twice in a row across a reshuffle. The list is read afresh at each reshuffle (it may grow).
 */
export class LineBag {
  private deck: string[] = [];
  private last: string | null = null;

  constructor(private readonly lines: () => readonly string[]) {}

  next(): string {
    if (!this.deck.length) {
      this.deck = shuffled(random, this.lines());
      // The deck's top is drawn first: not the line just said, when there is another.
      if (this.deck.length > 1 && this.deck[this.deck.length - 1] === this.last) this.deck.unshift(this.deck.pop()!);
    }
    const line = this.deck.pop() ?? '';
    this.last = line;
    return line;
  }
}
