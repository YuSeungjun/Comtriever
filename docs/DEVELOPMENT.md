# 개발과 빌드

[소개로 돌아가기](../README.md)

## 개발 환경

macOS, Node.js·npm, Xcode Command Line Tools가 필요합니다. 일반 사용자는 이 도구 없이 [DMG 설치 파일](https://github.com/YuSeungjun/Comtriever/releases/latest/download/comtrierver.dmg)만 내려받으면 됩니다.

```bash
npm ci
npm start
```

`npm start`는 필요할 때 창 감지용 네이티브 프로그램을 빌드합니다. 실행에 필요한 프레임과 애니메이션 정의는 `src/assets/retriever/`에 포함되어 있습니다.

## 검사

```bash
npm run check
npm test
npm run test:electron
```

Electron 검사는 임시 저장 폴더와 테스트 창을 사용합니다. 실제 사용자 데이터와 로그인 자동 실행 설정은 변경하지 않습니다. 창이 화면에 나타나므로 다른 GUI 테스트와 동시에 실행하지 마세요. macOS 이벤트 전송 권한이 없는 환경에서는 일부 실제 마우스 클릭 검사를 건너뜁니다.

## DMG 만들기

```bash
npm run dist
```

Apple Silicon과 Intel Mac 공용 `dist/comtrierver.dmg`를 생성합니다. 기본 배포 명령은 ad-hoc 서명을 사용하며 Apple Developer ID 서명·공증을 하지 않습니다.

정식 서명 배포는 Developer ID Application 인증서와 공증 환경을 준비한 뒤 실행합니다.

```bash
export APPLE_API_KEY=/absolute/path/AuthKey_XXXXXXXXXX.p8
export APPLE_API_KEY_ID=XXXXXXXXXX
export APPLE_API_ISSUER=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
npm run dist:mac
```

Apple ID 방식을 사용하는 경우 `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`를 설정합니다. 인증서, API 키와 비밀번호는 저장소에 넣지 마세요.

## 이미지 관리

| 경로 | 역할 | Git 포함 여부 |
| --- | --- | --- |
| `src/assets/retriever/` | 앱이 직접 사용하는 프레임과 애니메이션 정의 | 포함 |
| `logo/` | 앱 아이콘과 메뉴 막대 아이콘 원본 | 포함 |
| `docs/images/` | README 소개 이미지와 실제 화면 | 포함 |
| `new_img/` | 스프라이트 가공용 원본·작업 이미지 | 로컬 전용 |
| `img/` | 현재 사용하지 않는 이전 이미지 | 로컬 전용 |
| `docs/analysis/` | 개발 중 조사 자료 | 로컬 전용 |
| `build/`, `dist/` | 빌드 결과물. `build/`의 서명 설정 파일은 예외 | 로컬 전용 |

### 원본 그림을 다시 가공할 때만

일반 실행·테스트·DMG 빌드에는 `assets:prepare`가 필요하지 않습니다. 원본 그림을 직접 수정할 때만 아래 명령을 사용합니다.

```bash
COMTRIEVER_SPRITE_SOURCE_DIR=/absolute/path/to/artwork npm run assets:prepare
```

환경 변수를 생략하면 로컬 `new_img/`를 사용합니다. 입력 폴더 아래의 `무제 폴더`, `무제 폴더 2` 구조와 파일 이름은 `scripts/prepare-retriever-assets.js`에 정의되어 있습니다. 원본이 없거나 형식이 맞지 않으면 기존 앱 이미지를 바꾸기 전에 중단합니다.

아이콘만 다시 만들려면:

```bash
npm run icons:prepare
```

## README 이미지

소개 장면은 앱의 원래 캐릭터 이미지와 애니메이션 코드로 렌더링했습니다. 설정 화면은 사용자 데이터와 분리한 예시 저장 데이터로 실제 앱을 실행해 캡처했습니다. 자세한 원본과 갱신 방법은 [소개 이미지 설명](images/README.md)을 참고하세요.
