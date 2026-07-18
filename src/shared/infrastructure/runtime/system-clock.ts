import { type Clock, utcTimestamp } from "@/shared/domain/time";

export class SystemClock implements Clock {
  now() {
    return utcTimestamp(new Date());
  }
}
