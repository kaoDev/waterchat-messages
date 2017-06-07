import { Content } from '../model/Message'
import { ChannelId } from '../model/Channel'

export const SEND_MESSAGE = 'SEND_MESSAGE'
export const CREATE_CHANNEL = 'CREATE_CHANNEL'

export type MessageEventType = typeof SEND_MESSAGE | typeof CREATE_CHANNEL

export type SendMessage = Content &
  ChannelId & {
    readonly type: typeof SEND_MESSAGE
  }

export type CreateChannel = {
  readonly type: typeof CREATE_CHANNEL
  readonly userIds: string[]
}

export type MessageCommand = SendMessage | CreateChannel
