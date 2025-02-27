// Copyright 2020 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { ReactNode } from 'react';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { noop } from 'lodash';
import classNames from 'classnames';
import type { VideoFrameSource } from '@signalapp/ringrtc';
import type {
  ActiveCallStateType,
  SetLocalAudioType,
  SetLocalPreviewType,
  SetLocalVideoType,
  SetRendererCanvasType,
} from '../state/ducks/calling';
import { Avatar, AvatarSize } from './Avatar';
import { CallingHeader } from './CallingHeader';
import { CallingPreCallInfo, RingMode } from './CallingPreCallInfo';
import { CallingButton, CallingButtonType } from './CallingButton';
import { CallBackgroundBlur } from './CallBackgroundBlur';
import type {
  ActiveCallType,
  GroupCallVideoRequest,
  PresentedSource,
} from '../types/Calling';
import {
  CallMode,
  CallViewMode,
  CallState,
  GroupCallConnectionState,
  GroupCallJoinState,
} from '../types/Calling';
import { AvatarColors } from '../types/Colors';
import type { ConversationType } from '../state/ducks/conversations';
import { CallingToastManager } from './CallingToastManager';
import { DirectCallRemoteParticipant } from './DirectCallRemoteParticipant';
import { GroupCallRemoteParticipants } from './GroupCallRemoteParticipants';
import type { LocalizerType } from '../types/Util';
import { NeedsScreenRecordingPermissionsModal } from './NeedsScreenRecordingPermissionsModal';
import { missingCaseError } from '../util/missingCaseError';
import * as KeyboardLayout from '../services/keyboardLayout';
import { useActivateSpeakerViewOnPresenting } from '../hooks/useActivateSpeakerViewOnPresenting';
import {
  CallingAudioIndicator,
  SPEAKING_LINGER_MS,
} from './CallingAudioIndicator';
import {
  useActiveCallShortcuts,
  useKeyboardShortcuts,
} from '../hooks/useKeyboardShortcuts';
import { useValueAtFixedRate } from '../hooks/useValueAtFixedRate';

export type PropsType = {
  activeCall: ActiveCallType;
  getGroupCallVideoFrameSource: (demuxId: number) => VideoFrameSource;
  getPresentingSources: () => void;
  groupMembers?: Array<Pick<ConversationType, 'id' | 'firstName' | 'title'>>;
  hangUpActiveCall: (reason: string) => void;
  i18n: LocalizerType;
  me: ConversationType;
  openSystemPreferencesAction: () => unknown;
  setGroupCallVideoRequest: (
    _: Array<GroupCallVideoRequest>,
    speakerHeight: number
  ) => void;
  setLocalAudio: (_: SetLocalAudioType) => void;
  setLocalVideo: (_: SetLocalVideoType) => void;
  setLocalPreview: (_: SetLocalPreviewType) => void;
  setPresenting: (_?: PresentedSource) => void;
  setRendererCanvas: (_: SetRendererCanvasType) => void;
  stickyControls: boolean;
  switchToPresentationView: () => void;
  switchFromPresentationView: () => void;
  toggleParticipants: () => void;
  togglePip: () => void;
  toggleScreenRecordingPermissionsDialog: () => unknown;
  toggleSettings: () => void;
  toggleSpeakerView: () => void;
};

type DirectCallHeaderMessagePropsType = {
  i18n: LocalizerType;
  callState: CallState;
  joinedAt: number | null;
};

export const isInSpeakerView = (
  call: Pick<ActiveCallStateType, 'viewMode'> | undefined
): boolean => {
  return Boolean(
    call?.viewMode === CallViewMode.Presentation ||
      call?.viewMode === CallViewMode.Speaker
  );
};

function DirectCallHeaderMessage({
  callState,
  i18n,
  joinedAt,
}: DirectCallHeaderMessagePropsType): JSX.Element | null {
  const [acceptedDuration, setAcceptedDuration] = useState<
    number | undefined
  >();

  useEffect(() => {
    if (joinedAt == null) {
      return noop;
    }
    // It's really jumpy with a value of 500ms.
    const interval = setInterval(() => {
      setAcceptedDuration(Date.now() - joinedAt);
    }, 100);
    return clearInterval.bind(null, interval);
  }, [joinedAt]);

  if (callState === CallState.Reconnecting) {
    return <>{i18n('icu:callReconnecting')}</>;
  }
  if (callState === CallState.Accepted && acceptedDuration) {
    return (
      <>
        {i18n('icu:callDuration', {
          duration: renderDuration(acceptedDuration),
        })}
      </>
    );
  }
  return null;
}

export function CallScreen({
  activeCall,
  getGroupCallVideoFrameSource,
  getPresentingSources,
  groupMembers,
  hangUpActiveCall,
  i18n,
  me,
  openSystemPreferencesAction,
  setGroupCallVideoRequest,
  setLocalAudio,
  setLocalVideo,
  setLocalPreview,
  setPresenting,
  setRendererCanvas,
  stickyControls,
  switchToPresentationView,
  switchFromPresentationView,
  toggleParticipants,
  togglePip,
  toggleScreenRecordingPermissionsDialog,
  toggleSettings,
  toggleSpeakerView,
}: PropsType): JSX.Element {
  const {
    conversation,
    hasLocalAudio,
    hasLocalVideo,
    localAudioLevel,
    presentingSource,
    remoteParticipants,
    showNeedsScreenRecordingPermissionsWarning,
    showParticipantsList,
  } = activeCall;

  const isSpeaking = useValueAtFixedRate(
    localAudioLevel > 0,
    SPEAKING_LINGER_MS
  );

  useActivateSpeakerViewOnPresenting({
    remoteParticipants,
    switchToPresentationView,
    switchFromPresentationView,
  });

  const activeCallShortcuts = useActiveCallShortcuts(hangUpActiveCall);
  useKeyboardShortcuts(activeCallShortcuts);

  const toggleAudio = useCallback(() => {
    setLocalAudio({
      enabled: !hasLocalAudio,
    });
  }, [setLocalAudio, hasLocalAudio]);

  const toggleVideo = useCallback(() => {
    setLocalVideo({
      enabled: !hasLocalVideo,
    });
  }, [setLocalVideo, hasLocalVideo]);

  const togglePresenting = useCallback(() => {
    if (presentingSource) {
      setPresenting();
    } else {
      getPresentingSources();
    }
  }, [getPresentingSources, presentingSource, setPresenting]);

  const hangUp = useCallback(() => {
    hangUpActiveCall('button click');
  }, [hangUpActiveCall]);

  const [controlsHover, setControlsHover] = useState(false);

  const onControlsMouseEnter = useCallback(() => {
    setControlsHover(true);
  }, [setControlsHover]);

  const onControlsMouseLeave = useCallback(() => {
    setControlsHover(false);
  }, [setControlsHover]);

  const [showControls, setShowControls] = useState(true);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setLocalPreview({ element: localVideoRef });
    return () => {
      setLocalPreview({ element: undefined });
    };
  }, [setLocalPreview, setRendererCanvas]);

  useEffect(() => {
    if (!showControls || stickyControls || controlsHover) {
      return noop;
    }
    const timer = setTimeout(() => {
      setShowControls(false);
    }, 5000);
    return clearTimeout.bind(null, timer);
  }, [showControls, stickyControls, controlsHover]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      let eventHandled = false;

      const key = KeyboardLayout.lookup(event);

      if (event.shiftKey && (key === 'V' || key === 'v')) {
        toggleVideo();
        eventHandled = true;
      } else if (event.shiftKey && (key === 'M' || key === 'm')) {
        toggleAudio();
        eventHandled = true;
      }

      if (eventHandled) {
        event.preventDefault();
        event.stopPropagation();
        setShowControls(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [toggleAudio, toggleVideo]);

  const currentPresenter = remoteParticipants.find(
    participant => participant.presenting
  );

  const hasRemoteVideo = remoteParticipants.some(
    remoteParticipant => remoteParticipant.hasRemoteVideo
  );

  const isSendingVideo = hasLocalVideo || presentingSource;

  let isRinging: boolean;
  let hasCallStarted: boolean;
  let headerMessage: ReactNode | undefined;
  let headerTitle: string | undefined;
  let isConnected: boolean;
  let participantCount: number;
  let remoteParticipantsElement: ReactNode;

  switch (activeCall.callMode) {
    case CallMode.Direct: {
      isRinging =
        activeCall.callState === CallState.Prering ||
        activeCall.callState === CallState.Ringing;
      hasCallStarted = !isRinging;
      headerMessage = (
        <DirectCallHeaderMessage
          i18n={i18n}
          callState={activeCall.callState || CallState.Prering}
          joinedAt={activeCall.joinedAt}
        />
      );
      headerTitle = isRinging ? undefined : conversation.title;
      isConnected = activeCall.callState === CallState.Accepted;
      participantCount = isConnected ? 2 : 0;
      remoteParticipantsElement = hasCallStarted ? (
        <DirectCallRemoteParticipant
          conversation={conversation}
          hasRemoteVideo={hasRemoteVideo}
          i18n={i18n}
          setRendererCanvas={setRendererCanvas}
        />
      ) : (
        <div className="module-ongoing-call__direct-call-ringing-spacer" />
      );
      break;
    }
    case CallMode.Group:
      isRinging =
        activeCall.outgoingRing &&
        !activeCall.remoteParticipants.length &&
        !(groupMembers?.length === 1 && groupMembers[0].id === me.id);
      hasCallStarted = activeCall.joinState !== GroupCallJoinState.NotJoined;
      participantCount = activeCall.remoteParticipants.length + 1;

      if (isRinging) {
        headerTitle = undefined;
      } else if (currentPresenter) {
        headerTitle = i18n('icu:calling__presenting--person-ongoing', {
          name: currentPresenter.title,
        });
      } else if (!activeCall.remoteParticipants.length) {
        headerTitle = i18n('icu:calling__in-this-call--zero');
      }

      isConnected =
        activeCall.connectionState === GroupCallConnectionState.Connected;
      remoteParticipantsElement = (
        <GroupCallRemoteParticipants
          getGroupCallVideoFrameSource={getGroupCallVideoFrameSource}
          i18n={i18n}
          isInSpeakerView={isInSpeakerView(activeCall)}
          remoteParticipants={activeCall.remoteParticipants}
          setGroupCallVideoRequest={setGroupCallVideoRequest}
          remoteAudioLevels={activeCall.remoteAudioLevels}
        />
      );
      break;
    default:
      throw missingCaseError(activeCall);
  }

  let lonelyInCallNode: ReactNode;
  let localPreviewNode: ReactNode;

  const isLonelyInGroup =
    activeCall.callMode === CallMode.Group &&
    !activeCall.remoteParticipants.length;

  const isLonelyInDirectCall =
    activeCall.callMode === CallMode.Direct &&
    activeCall.callState !== CallState.Accepted;

  if (isLonelyInGroup || isLonelyInDirectCall) {
    lonelyInCallNode = (
      <div
        className={classNames(
          'module-ongoing-call__local-preview-fullsize',
          presentingSource &&
            'module-ongoing-call__local-preview-fullsize--presenting'
        )}
      >
        {isSendingVideo ? (
          <video ref={localVideoRef} autoPlay />
        ) : (
          <CallBackgroundBlur avatarPath={me.avatarPath} color={me.color}>
            <Avatar
              acceptedMessageRequest
              avatarPath={me.avatarPath}
              badge={undefined}
              color={me.color || AvatarColors[0]}
              noteToSelf={false}
              conversationType="direct"
              i18n={i18n}
              isMe
              phoneNumber={me.phoneNumber}
              profileName={me.profileName}
              title={me.title}
              // `sharedGroupNames` makes no sense for yourself, but `<Avatar>` needs it
              //   to determine blurring.
              sharedGroupNames={[]}
              size={AvatarSize.EIGHTY}
            />
            <div className="module-calling__camera-is-off">
              {i18n('icu:calling__your-video-is-off')}
            </div>
          </CallBackgroundBlur>
        )}
      </div>
    );
  } else {
    localPreviewNode = isSendingVideo ? (
      <video
        className={classNames(
          'module-ongoing-call__footer__local-preview__video',
          presentingSource &&
            'module-ongoing-call__footer__local-preview__video--presenting'
        )}
        ref={localVideoRef}
        autoPlay
      />
    ) : (
      <CallBackgroundBlur avatarPath={me.avatarPath} color={me.color}>
        <Avatar
          acceptedMessageRequest
          avatarPath={me.avatarPath}
          badge={undefined}
          color={me.color || AvatarColors[0]}
          noteToSelf={false}
          conversationType="direct"
          i18n={i18n}
          isMe
          phoneNumber={me.phoneNumber}
          profileName={me.profileName}
          title={me.title}
          // See comment above about `sharedGroupNames`.
          sharedGroupNames={[]}
          size={AvatarSize.EIGHTY}
        />
      </CallBackgroundBlur>
    );
  }

  let videoButtonType: CallingButtonType;
  if (presentingSource) {
    videoButtonType = CallingButtonType.VIDEO_DISABLED;
  } else if (hasLocalVideo) {
    videoButtonType = CallingButtonType.VIDEO_ON;
  } else {
    videoButtonType = CallingButtonType.VIDEO_OFF;
  }

  const audioButtonType = hasLocalAudio
    ? CallingButtonType.AUDIO_ON
    : CallingButtonType.AUDIO_OFF;

  const isAudioOnly = !hasLocalVideo && !hasRemoteVideo;

  const controlsFadeClass = classNames({
    'module-ongoing-call__controls--fadeIn':
      (showControls || isAudioOnly) && !isConnected,
    'module-ongoing-call__controls--fadeOut':
      !showControls && !isAudioOnly && isConnected,
  });

  const isGroupCall = activeCall.callMode === CallMode.Group;

  let presentingButtonType: CallingButtonType;
  if (presentingSource) {
    presentingButtonType = CallingButtonType.PRESENTING_ON;
  } else if (currentPresenter) {
    presentingButtonType = CallingButtonType.PRESENTING_DISABLED;
  } else {
    presentingButtonType = CallingButtonType.PRESENTING_OFF;
  }

  return (
    <div
      className={classNames(
        'module-calling__container',
        `module-ongoing-call__container--${getCallModeClassSuffix(
          activeCall.callMode
        )}`,
        `module-ongoing-call__container--${
          hasCallStarted ? 'call-started' : 'call-not-started'
        }`
      )}
      onFocus={() => {
        setShowControls(true);
      }}
      onMouseMove={() => {
        setShowControls(true);
      }}
      role="group"
    >
      {showNeedsScreenRecordingPermissionsWarning ? (
        <NeedsScreenRecordingPermissionsModal
          toggleScreenRecordingPermissionsDialog={
            toggleScreenRecordingPermissionsDialog
          }
          i18n={i18n}
          openSystemPreferencesAction={openSystemPreferencesAction}
        />
      ) : null}
      <CallingToastManager activeCall={activeCall} i18n={i18n} />
      <div
        className={classNames('module-ongoing-call__header', controlsFadeClass)}
      >
        <CallingHeader
          i18n={i18n}
          isInSpeakerView={isInSpeakerView(activeCall)}
          isGroupCall={isGroupCall}
          message={headerMessage}
          participantCount={participantCount}
          showParticipantsList={showParticipantsList}
          title={headerTitle}
          toggleParticipants={toggleParticipants}
          togglePip={togglePip}
          toggleSettings={toggleSettings}
          toggleSpeakerView={toggleSpeakerView}
        />
      </div>
      {isRinging && (
        <CallingPreCallInfo
          conversation={conversation}
          groupMembers={groupMembers}
          i18n={i18n}
          me={me}
          ringMode={RingMode.IsRinging}
        />
      )}
      {remoteParticipantsElement}
      {lonelyInCallNode}
      <div className="module-ongoing-call__footer">
        {/* This layout-only element is not ideal.
            See the comment in _modules.css for more. */}
        <div className="module-ongoing-call__footer__local-preview-offset" />
        <div
          className={classNames(
            'module-ongoing-call__footer__actions',
            controlsFadeClass
          )}
        >
          <CallingButton
            buttonType={presentingButtonType}
            i18n={i18n}
            onMouseEnter={onControlsMouseEnter}
            onMouseLeave={onControlsMouseLeave}
            onClick={togglePresenting}
          />
          <CallingButton
            buttonType={videoButtonType}
            i18n={i18n}
            onMouseEnter={onControlsMouseEnter}
            onMouseLeave={onControlsMouseLeave}
            onClick={toggleVideo}
          />
          <CallingButton
            buttonType={audioButtonType}
            i18n={i18n}
            onMouseEnter={onControlsMouseEnter}
            onMouseLeave={onControlsMouseLeave}
            onClick={toggleAudio}
          />
          <CallingButton
            buttonType={CallingButtonType.HANG_UP}
            i18n={i18n}
            onMouseEnter={onControlsMouseEnter}
            onMouseLeave={onControlsMouseLeave}
            onClick={hangUp}
          />
        </div>
        <div className="module-ongoing-call__footer__local-preview">
          {localPreviewNode}
          <CallingAudioIndicator
            hasAudio={hasLocalAudio}
            audioLevel={localAudioLevel}
            shouldShowSpeaking={isSpeaking}
          />
        </div>
      </div>
    </div>
  );
}

function getCallModeClassSuffix(
  callMode: CallMode.Direct | CallMode.Group
): string {
  switch (callMode) {
    case CallMode.Direct:
      return 'direct';
    case CallMode.Group:
      return 'group';
    default:
      throw missingCaseError(callMode);
  }
}

function renderDuration(ms: number): string {
  const secs = Math.floor((ms / 1000) % 60)
    .toString()
    .padStart(2, '0');
  const mins = Math.floor((ms / 60000) % 60)
    .toString()
    .padStart(2, '0');
  const hours = Math.floor(ms / 3600000);
  if (hours > 0) {
    return `${hours}:${mins}:${secs}`;
  }
  return `${mins}:${secs}`;
}
