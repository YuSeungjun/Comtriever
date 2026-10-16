#import <Cocoa/Cocoa.h>
#import <CoreGraphics/CoreGraphics.h>
#include <stdio.h>

static NSUInteger clickCount = 0;
@interface FixtureView : NSView
@end
@implementation FixtureView
- (BOOL)acceptsFirstMouse:(NSEvent *)event { return YES; }
- (void)mouseDown:(NSEvent *)event { clickCount++; }
@end

static void emitWindow(NSWindow *window) {
  NSRect frame = window.frame;
  CGRect r = CGRectMake(frame.origin.x, NSScreen.screens.firstObject.frame.size.height - NSMaxY(frame), frame.size.width, frame.size.height);
  {
    NSDictionary *result = @{@"id": @(window.windowNumber), @"x": @(r.origin.x), @"y": @(r.origin.y), @"width": @(r.size.width), @"height": @(r.size.height),
      @"frontmostPID": @(NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier),
      @"clickCount": @(clickCount), @"postEventsAllowed": @(CGPreflightPostEventAccess())};
    NSData *data = [NSJSONSerialization dataWithJSONObject:result options:0 error:nil];
    fwrite(data.bytes, 1, data.length, stdout); fputc('\n', stdout); fflush(stdout);
  }
}
int main() {
  @autoreleasepool {
    [NSApplication sharedApplication];
    [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
    NSWindow *window = [[NSWindow alloc] initWithContentRect:NSMakeRect(180, 100, 650, 260)
      styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable backing:NSBackingStoreBuffered defer:NO];
    window.title = @"Comtriever platform test";
    window.releasedWhenClosed = NO;
    window.contentView = [[FixtureView alloc] initWithFrame:window.contentView.bounds];
    window.backgroundColor = [NSColor colorWithRed:0.91 green:0.95 blue:0.93 alpha:1];
    [window orderFrontRegardless];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 200 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{ emitWindow(window); });
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
      char line[4096];
      while (fgets(line, sizeof(line), stdin)) {
        NSData *data = [[NSString stringWithUTF8String:line] dataUsingEncoding:NSUTF8StringEncoding];
        NSDictionary *command = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
        dispatch_sync(dispatch_get_main_queue(), ^{
          NSString *action = command[@"action"];
          if ([action isEqual:@"move"]) {
            CGFloat screenHeight = NSScreen.screens.firstObject.frame.size.height;
            NSRect frame = window.frame;
            frame.origin.x = [command[@"x"] doubleValue];
            frame.origin.y = screenHeight - [command[@"y"] doubleValue] - frame.size.height;
            [window setFrame:frame display:YES];
          } else if ([action isEqual:@"minimize"]) [window miniaturize:nil];
          else if ([action isEqual:@"show"]) { [window deminiaturize:nil]; [window orderFrontRegardless]; }
          else if ([action isEqual:@"focus"]) { [NSApp activateIgnoringOtherApps:YES]; [window makeKeyAndOrderFront:nil]; }
          else if ([action isEqual:@"move-pointer"]) {
            CGEventRef move = CGEventCreateMouseEvent(NULL, kCGEventMouseMoved,
              CGPointMake([command[@"x"] doubleValue], [command[@"y"] doubleValue]), kCGMouseButtonLeft);
            CGEventPost(kCGHIDEventTap, move); CFRelease(move);
          }
          else if ([action isEqual:@"click"]) {
            CGPoint point = CGPointMake([command[@"x"] doubleValue], [command[@"y"] doubleValue]);
            CGEventRef move = CGEventCreateMouseEvent(NULL, kCGEventMouseMoved, point, kCGMouseButtonLeft);
            CGEventRef down = CGEventCreateMouseEvent(NULL, kCGEventLeftMouseDown, point, kCGMouseButtonLeft);
            CGEventRef up = CGEventCreateMouseEvent(NULL, kCGEventLeftMouseUp, point, kCGMouseButtonLeft);
            CGEventSetIntegerValueField(down, kCGMouseEventClickState, 1);
            CGEventSetIntegerValueField(up, kCGMouseEventClickState, 1);
            CGEventPost(kCGHIDEventTap, move);
            dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 50 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
              CGEventPost(kCGHIDEventTap, down); CFRelease(down);
            });
            dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 150 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
              CGEventPost(kCGHIDEventTap, up); CFRelease(up);
            });
            CFRelease(move);
          }
          else if ([action isEqual:@"close"]) { [window close]; [NSApp terminate:nil]; }
          emitWindow(window);
        });
      }
      dispatch_async(dispatch_get_main_queue(), ^{ [NSApp terminate:nil]; });
    });
    [NSApp run];
  }
  return 0;
}
