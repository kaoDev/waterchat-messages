import { DisplayUser, UserId } from '../model/User'
import { Message } from '../model/Message'
import { ChannelId, ChannelUsers } from '../model/Channel'

export const USER_LOGGED_IN = 'USER_LOGGED_IN'
export const USER_LOGGED_OUT = 'USER_LOGGED_OUT'
export const MESSAGE_RECEIVED = 'MESSAGE_RECEIVED'
export const CHANNEL_CREATED = 'CHANNEL_CREATED'
export const ONLINE_USERS_CHANGED = 'ONLINE_USERS_CHANGED'
export const AVAILABLE_CHANNELS_CHANGED = 'AVAILABLE_CHANNELS_CHANGED'
export const SERVICE_STARTED = 'SERVICE_STARTED'

export type MessageEventType =
  | typeof USER_LOGGED_IN
  | typeof USER_LOGGED_OUT
  | typeof MESSAGE_RECEIVED
  | typeof CHANNEL_CREATED
  | typeof ONLINE_USERS_CHANGED

export type UserLoggedIn = DisplayUser & {
  readonly type: typeof USER_LOGGED_IN
}

export type UserLoggedOut = UserId & {
  readonly type: typeof USER_LOGGED_OUT
}

export type MessageReceived = Message & {
  readonly type: typeof MESSAGE_RECEIVED
}

export type ChannelCreated = ChannelId &
  ChannelUsers & {
    readonly type: typeof CHANNEL_CREATED
  }

export type OnlineUsersChanged = {
  readonly type: typeof ONLINE_USERS_CHANGED
  readonly users: DisplayUser[]
}

export type AvailableChannelsChanged = {
  readonly type: typeof AVAILABLE_CHANNELS_CHANGED
  readonly channels: {
    readonly channelId: string
    readonly userIds: string[]
  }[]
}

export type ServiceStarted = {
  type: typeof SERVICE_STARTED
}

export type ServiceEvent =
  | UserLoggedIn
  | UserLoggedOut
  | MessageReceived
  | ChannelCreated
  | OnlineUsersChanged
  | ServiceStarted
  | AvailableChannelsChanged
