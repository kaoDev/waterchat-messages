import {
  USER_LOGGED_IN,
  USER_LOGGED_OUT,
  CHANNEL_CREATED,
  MESSAGE_RECEIVED,
  ServiceEvent,
  UserLoggedOut,
  ChannelCreated,
  MessageReceived,
  UserLoggedIn,
} from '../events/Events'
import { State } from '../model/State'

const stateHasRegisteredUser = ({ users }: State) => (userId: string) =>
  users.some(({ userId: id }) => userId === id)

const authorizeUserLoggedInEvent = (state: State) => (event: UserLoggedIn) =>
  true

const authorizeUserLoggedOutEvent = (state: State) => (event: UserLoggedOut) =>
  stateHasRegisteredUser(state)(event.userId)

const authorizeChannelCreated = (state: State) => (event: ChannelCreated) =>
  state.activeChannels.every(c => c.channelId !== event.channelId) &&
  state.inactiveChannels.every(c => c.channelId !== event.channelId)

const authorizeServerReceivedMessage = (state: State) => (
  event: MessageReceived
) =>
  state.activeChannels.some(c => c.channelId === event.channelId) &&
  event.content.length > 0 &&
  event.messageId.length > 0

export const authorizeEvent = (state: State) => (
  event: ServiceEvent
): boolean => {
  switch (event.type) {
    case USER_LOGGED_IN:
      return authorizeUserLoggedInEvent(state)(event)
    case USER_LOGGED_OUT:
      return authorizeUserLoggedOutEvent(state)(event)
    case CHANNEL_CREATED:
      return authorizeChannelCreated(state)(event)
    case MESSAGE_RECEIVED:
      return authorizeServerReceivedMessage(state)(event)
    default:
      return false
  }
}
