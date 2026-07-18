export interface ProblemFieldError {
  readonly field: string;
  readonly message: string;
}

export interface ProblemDetails {
  readonly code: string;
  readonly correlationId: string;
  readonly detail: string;
  readonly errors?: readonly ProblemFieldError[];
  readonly status: number;
  readonly title: string;
  readonly type: string;
}

export class HttpProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly errors?: readonly ProblemFieldError[],
  ) {
    super(message);
    this.name = "HttpProblem";
  }
}
