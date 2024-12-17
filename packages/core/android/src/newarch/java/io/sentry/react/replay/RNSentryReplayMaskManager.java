package io.sentry.react.replay;

import androidx.annotation.NonNull;
import com.facebook.react.module.annotations.ReactModule;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.ViewGroupManager;
import com.facebook.react.uimanager.ViewManagerDelegate;
import com.facebook.react.viewmanagers.RNSentryReplayMaskManagerDelegate;
import com.facebook.react.viewmanagers.RNSentryReplayMaskManagerInterface;

@ReactModule(name = RNSentryReplayMaskManagerImpl.REACT_CLASS)
public class RNSentryReplayMaskManager extends ViewGroupManager<RNSentryReplayMask>
    implements RNSentryReplayMaskManagerInterface<RNSentryReplayMask> {
  private final RNSentryReplayMaskManagerDelegate<RNSentryReplayMask, RNSentryReplayMaskManager>
      delegate = new RNSentryReplayMaskManagerDelegate<>(this);

  @Override
  public ViewManagerDelegate<RNSentryReplayMask> getDelegate() {
    return delegate;
  }

  @NonNull
  @Override
  public String getName() {
    return RNSentryReplayMaskManagerImpl.REACT_CLASS;
  }

  @NonNull
  @Override
  public RNSentryReplayMask createViewInstance(@NonNull ThemedReactContext context) {
    return new RNSentryReplayMask(context);
  }
}