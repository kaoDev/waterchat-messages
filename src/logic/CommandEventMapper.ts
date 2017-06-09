import {
  CREATE_CHANNEL,
  SEND_MESSAGE,
  MessageCommand,
} from '../events/Commands'
import {
  CHANNEL_CREATED,
  MESSAGE_RECEIVED,
  ServiceEvent,
} from '../events/Events'
import { DisplayUser } from '../model/User'
import * as uuid from 'uuid'
import { format } from 'date-fns'

export const createEventFromCommand = (user: DisplayUser) => (
  command: MessageCommand
): ServiceEvent | undefined => {
  switch (command.type) {
    case CREATE_CHANNEL:
      const userIds = command.userIds.some(id => id === user.userId)
        ? command.userIds
        : [...command.userIds, user.userId]
      return {
        channelId: uuid.v4(),
        type: CHANNEL_CREATED,
        userIds,
      }
    case SEND_MESSAGE:
      return {
        type: MESSAGE_RECEIVED,
        channelId: command.channelId,
        content: command.content,
        messageId: uuid.v4(),
        timestamp: format(new Date()),
        userId: user.userId,
      }
  }
}
