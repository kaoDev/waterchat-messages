import { UserId } from './User'
import { ChannelId } from './Channel'
import { Timestamp } from './Generic'

export type MessageId = {
  readonly messageId: string
}

export type Content = {
  readonly content: string
}

export type Message = UserId & ChannelId & Timestamp & MessageId & Content
