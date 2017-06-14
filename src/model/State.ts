import { DisplayUser, UserId } from './User'
import { Channel } from './Channel'

export type UserConnection = UserId & {
  readonly connectionCount: number
}

export type State = {
  readonly connections: UserConnection[]
  readonly users: DisplayUser[]
  readonly channels: Channel[]
}
