export type Success<T> = {
  readonly kind: 'success'
  readonly value: T
}

export type Failure<E> = {
  readonly kind: 'failure'
  readonly error: E
}

export type Result<T, E = Error> = Success<T> | Failure<E>