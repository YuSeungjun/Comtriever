# Comtriever

Comtriever는 macOS 데스크탑 위에서 함께 움직이는 작은 리트리버 반려 앱입니다. 작업 중인 화면 위에 강아지가 나타나고, 메뉴 막대에서 보이기/숨기기와 간단한 동작을 조작할 수 있습니다.

## 다운로드 및 설치

GitHub Releases에서 최신 `Comtriever-0.1.0-universal.dmg` 파일을 다운로드합니다.

1. 다운로드한 DMG 파일을 엽니다.
2. `Comtriever.app`을 `Applications` 폴더로 드래그합니다.
3. `Applications` 폴더에서 `Comtriever.app`을 실행합니다.
4. 처음 실행할 때 macOS가 차단하면 `Comtriever.app`을 우클릭한 뒤 `열기`를 누릅니다.
5. 그래도 차단되면 `시스템 설정 > 개인정보 보호 및 보안`에서 `그래도 열기`를 누릅니다.

처음 한 번만 허용하면 이후에는 일반 앱처럼 실행됩니다.

## macOS 보안 경고 안내

현재 배포 파일은 무료 MVP/테스트 배포용 unsigned 빌드입니다. Apple Developer ID 서명과 공증을 하지 않았기 때문에 macOS에서 다음과 같은 경고가 나올 수 있습니다.

- "`Comtriever`을(를) 열지 않음"
- "Apple은 악성 코드가 없는지 확인할 수 없습니다"
- "확인되지 않은 개발자"

이 경고는 앱이 악성이라는 뜻이 아니라, Apple 유료 개발자 계정으로 서명 및 공증된 앱이 아니라는 뜻입니다. 비용 없는 공개 테스트 배포에서는 이 경고를 완전히 없앨 수 없습니다.

## 주요 기능

- 데스크탑 위에 리트리버 캐릭터가 표시됩니다.
- 리트리버가 대기, 걷기, 다시 등장, 기쁨, 잠자기 애니메이션을 재생합니다.
- 메뉴 막대 아이콘에서 설정 창을 열 수 있습니다.
- `리트리버 집으로 보내기`로 화면에서 잠시 숨길 수 있습니다.
- `다시 부르기`로 리트리버를 다시 나타나게 할 수 있습니다.
- `항상 위에 표시`로 다른 앱 위에 리트리버를 유지할 수 있습니다.
- `작업창 가리지 않기`로 작업 중인 창을 방해하지 않게 할 수 있습니다.
- 마지막 표시 상태, 위치, 표시 모드가 저장됩니다.
- macOS 로그인 시 자동 실행을 설정할 수 있습니다.

## 직접 실행하기

개발 환경에서 직접 실행하려면 Node.js와 npm이 필요합니다.

```bash
npm install
npm start
```

## 배포 파일 만들기

무료 배포용 DMG를 만들려면 다음 명령을 실행합니다.

```bash
npm run dist
```

생성 파일은 `dist/` 폴더에 저장됩니다.

```bash
dist/Comtriever-0.1.0-universal.dmg
```

이 명령은 `npm run dist:mac:unsigned`를 실행합니다. unsigned 빌드이므로 다른 Mac에서 처음 실행할 때 위의 macOS 보안 경고가 표시될 수 있습니다.

## 정식 서명 배포

macOS 보안 경고를 줄이려면 Apple Developer Program 가입, Developer ID Application 인증서, Apple notarization 설정이 필요합니다.

```bash
npm run dist:mac
```

이 명령은 서명/공증 환경이 준비되지 않으면 실패하도록 설정되어 있습니다. 인증서, `.p8` 키, 앱 전용 비밀번호, Team ID 같은 민감한 정보는 저장소에 커밋하지 마세요.

권장 notarization 환경 변수:

```bash
export APPLE_API_KEY=/absolute/path/AuthKey_XXXXXXXXXX.p8
export APPLE_API_KEY_ID=XXXXXXXXXX
export APPLE_API_ISSUER=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
npm run dist:mac
```

Apple ID 방식:

```bash
export APPLE_ID=you@example.com
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=TEAMID1234
npm run dist:mac
```

## 에셋 준비

리트리버 스프라이트와 macOS 아이콘 에셋을 다시 준비하려면 다음 명령을 사용합니다.

```bash
npm run assets:prepare
npm run icons:prepare
```
