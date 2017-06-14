import { Observable } from 'rxjs/Observable'
import { MessageReceived } from '../events/Events'

export type ChannelId = {
  readonly channelId: string
}

export type ChannelUsers = {
  readonly userIds: string[]
}

export const PUBLIC_CHANNEL_ID = 'public'

export type Channel = ChannelId &
  ChannelUsers & {
    readonly messages: Observable<MessageReceived>
  }
