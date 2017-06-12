import { Observable } from 'rxjs/Observable'
import { MessageReceived } from '../events/Events'

export type ChannelId = {
  readonly channelId: string
}

export const PUBLIC_CHANNEL_ID = 'public'

export type Channel = ChannelId & {
  readonly userIds: string[]
}

export type ActiveChannel = Channel & {
  readonly messages: Observable<MessageReceived>
}
