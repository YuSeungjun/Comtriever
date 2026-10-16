#import <Foundation/Foundation.h>
#import <AppKit/NSRunningApplication.h>
#import <CoreGraphics/CoreGraphics.h>
#include <stdio.h>
#include <stdlib.h>

// Geometry, IDs and Dock ownership only; no images, titles, or accessibility access.
int main(int argc, const char *argv[]) {
  pid_t excludedPID = argc > 1 ? (pid_t)atoi(argv[1]) : getppid();
  char command[32];
  while (fgets(command, sizeof(command), stdin)) {
    @autoreleasepool {
      CFArrayRef list = CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID);
      if (!list) { puts("null"); fflush(stdout); continue; }
      NSMutableArray *windows = [NSMutableArray array];
      for (NSDictionary *info in (__bridge NSArray *)list) {
        if ([info[(id)kCGWindowOwnerPID] intValue] == excludedPID || [info[(id)kCGWindowAlpha] doubleValue] < 0.1) continue;
        CGRect rect;
        if (!CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)info[(id)kCGWindowBounds], &rect)) continue;
        if (rect.size.width < 20 || rect.size.height < 20) continue;
        // macOS can expose a screen-sized, transparent Dock window at Dock
        // level with alpha=1. Its rectangle does not occlude application windows.
        NSInteger layer = [info[(id)kCGWindowLayer] integerValue];
        BOOL isDock = NO;
        if (layer == CGWindowLevelForKey(kCGDockWindowLevelKey)) {
          NSRunningApplication *owner = [NSRunningApplication runningApplicationWithProcessIdentifier:[info[(id)kCGWindowOwnerPID] intValue]];
          isDock = [owner.bundleIdentifier isEqualToString:@"com.apple.dock"];
        }
        [windows addObject:@{@"id": info[(id)kCGWindowNumber], @"pid": info[(id)kCGWindowOwnerPID],
          @"layer": info[(id)kCGWindowLayer], @"x": @(rect.origin.x), @"y": @(rect.origin.y),
          @"width": @(rect.size.width), @"height": @(rect.size.height), @"isDock": @(isDock)}];
      }
      CFRelease(list);
      NSData *data = [NSJSONSerialization dataWithJSONObject:windows options:0 error:nil];
      if (data) fwrite(data.bytes, 1, data.length, stdout); else fputs("null", stdout);
      fputc('\n', stdout);
      fflush(stdout);
    }
  }
  return 0;
}
