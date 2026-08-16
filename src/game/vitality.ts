/**
 * 世界生机 — World Vitality (story-beats.md §1, device #2). Each world holds a
 * 0..1 vitality. 迪迪 taking a 真身零件 drains a notch and the world desaturates
 * (天空去饱和、雾变灰、星星熄灭); 独独, tagging along behind, quietly restores it —
 * the silent repair the story reveals at 节拍7 ("那些悄悄回升的数字，全是独独的轮印").
 *
 * This is the second half of the wordless vocabulary: echo is 表情/叫声, this
 * is 颜色. Vitality is stored per world, so dimming one world and relighting
 * another are independent — exactly the one-line story.
 */
export class WorldVitality {
  private readonly byWorld = new Map<string, number>();
  private currentId = "";

  setUniverse(id: string): void {
    this.currentId = id;
    if (!this.byWorld.has(id)) {
      this.byWorld.set(id, 1);
    }
  }

  /** Current world's vitality, 0 (drained/grey) .. 1 (full colour). */
  get value(): number {
    return this.byWorld.get(this.currentId) ?? 1;
  }

  /** 迪迪 takes a part: this world dims a notch. */
  drain(amount: number): void {
    this.byWorld.set(this.currentId, clamp(this.value - amount, 0, 1));
  }

  /** 独独 relights what 迪迪 dimmed — slow, behind your back. */
  restore(dt: number, ratePerSec: number): void {
    if (this.value < 1) {
      this.byWorld.set(this.currentId, clamp(this.value + ratePerSec * dt, 0, 1));
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
