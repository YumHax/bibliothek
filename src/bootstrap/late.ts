/**
 * A service made after the code that needs it was wired (the Session, made last, that a console
 * click on the stand asks to point at a box). `get()` before `set()` throws an error naming the
 * service, instead of the `undefined` or temporal-dead-zone error a forward `let` would give.
 */
export interface Late<T> {
  get(): T;
  /** Sets it, once; returns it. */
  set(value: T): T;
  readonly isSet: boolean;
}

export function late<T>(name: string): Late<T> {
  let value: T | undefined;
  let set = false;
  return {
    get(): T {
      if (!set) throw new Error(`[bootstrap] ${name} was used before it was made (see src/bootstrap/)`);
      return value as T;
    },
    set(next: T): T {
      if (set) throw new Error(`[bootstrap] ${name} was made twice`);
      value = next;
      set = true;
      return next;
    },
    get isSet(): boolean {
      return set;
    },
  };
}
