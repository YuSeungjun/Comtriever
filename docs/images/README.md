# 소개 이미지

- `hero.png`: 실제 리트리버 이미지와 HTML/CSS로 구성한 소개 배너입니다.
- `companion.gif`: 실제 프레임, 애니메이션 속도와 `PetAnimator`의 몸 움직임을 사용한 8초 소개 장면입니다. 개인 데스크톱을 녹화한 영상은 아닙니다.
- `settings.png`: 예시 데이터를 넣은 실제 앱의 함께하기 화면입니다. 사용자 데이터나 개인 창은 포함하지 않습니다.

이미지를 다시 만들려면 macOS에서 의존성을 설치하고 `ffmpeg`를 준비한 뒤 실행합니다.

```bash
npx electron scripts/prepare-readme-media.cjs
```

생성 스크립트는 임시 프로필을 사용합니다. 결과는 이 폴더에 덮어씁니다. README용 미디어는 앱 실행이나 DMG 빌드에 필요하지 않습니다.
