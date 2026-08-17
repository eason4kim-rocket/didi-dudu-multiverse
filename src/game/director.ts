/**
 * 剧情导演 (Director). A tiny state machine that turns the loose mechanics into
 * a story you can actually walk through: it watches real game state and, when a
 * beat's goal is met, advances and surfaces the next beat's line (story-arc.md
 * §6 "剧情导演"). Wordless play, minimal guidance — one evocative line per beat.
 *
 * Season-1 arc as it stands (no workshop / transformation / fusion):
 *   b0 hear the shard → b1 go through the 门 → b2 take a 真身零件 →
 *   b3 lose & get the head back (会碎) → b4 grow heavy with parts →
 *   b5 the gate opens a crack (finale, terminal).
 *
 * Session-scoped, like the rest of the game state (parts, vitality all reset on
 * reload), so it starts at b0 each session — no desync with unsaved progress.
 */

export interface StoryState {
  /** 迪迪 is close to the beacon shard (in the opening world). */
  nearBeacon: boolean;
  /** Has ever crossed a portal out of the opening world. */
  everLeftDusk: boolean;
  /** Body-parts assembled across the whole journey. */
  totalTaken: number;
  /** Times 迪迪 lost its head and got it back. */
  headRecoveries: number;
}

interface Beat {
  key: string; // i18n key for the guidance line
  done: (s: StoryState) => boolean;
}

const BEATS: Beat[] = [
  { key: "story.b0", done: (s) => s.nearBeacon },
  { key: "story.b1", done: (s) => s.everLeftDusk },
  { key: "story.b2", done: (s) => s.totalTaken >= 1 },
  { key: "story.b3", done: (s) => s.headRecoveries >= 1 },
  { key: "story.b4", done: (s) => s.totalTaken >= 4 },
  { key: "story.b5", done: () => false }, // 门开一条缝 — terminal
];

export class Director {
  private index = 0;
  private announce = true; // surface the opening beat on the first update

  /**
   * Feed game state each frame. Returns the new beat's prompt key when the beat
   * just changed (or on the very first call), otherwise null.
   */
  update(state: StoryState): string | null {
    if (this.announce) {
      this.announce = false;
      return BEATS[this.index].key;
    }
    const beat = BEATS[this.index];
    if (this.index < BEATS.length - 1 && beat.done(state)) {
      this.index += 1;
      return BEATS[this.index].key;
    }
    return null;
  }

  get currentKey(): string {
    return BEATS[this.index].key;
  }

  get atFinale(): boolean {
    return this.index === BEATS.length - 1;
  }
}
