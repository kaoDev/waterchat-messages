import {
  USER_LOGGED_IN,
  USER_LOGGED_OUT,
  CHANNEL_CREATED,
  MESSAGE_RECEIVED,
  SERVICE_STARTED,
  ServiceEvent,
  UserLoggedOut,
  ChannelCreated,
  MessageReceived,
  UserLoggedIn,
} from '../events/Events'
import { State } from '../model/State'
import { differenceInHours } from 'date-fns'

const authorizeUserLoggedInEvent = (state: State) => (event: UserLoggedIn) =>
  true

const authorizeUserLoggedOutEvent = (state: State) => (event: UserLoggedOut) =>
  true

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
    case SERVICE_STARTED:
      return true
    default:
      return false
  }
}

export const isServiceEvent = (event: ServiceEvent) => {
  switch (event.type) {
    case MESSAGE_RECEIVED:
      return Math.abs(differenceInHours(new Date(), event.timestamp)) < 1
    case USER_LOGGED_IN:
    case USER_LOGGED_OUT:
    case CHANNEL_CREATED:
    case SERVICE_STARTED:
      return true
    default:
      return false
  }
}
