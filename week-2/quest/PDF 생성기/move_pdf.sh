#!/bin/bash

TARGET="/Users/sugnyeo/Downloads/afm/week-2/quest/PDF 생성기"
DOWNLOADS="$HOME/Downloads"

echo "PDF 파일 감시 중... (종료: Ctrl+C)"
echo "다운로드된 PDF가 자동으로 '$TARGET' 로 이동됩니다."
echo ""

while true; do
  for f in "$DOWNLOADS"/*.pdf; do
    [ -f "$f" ] || continue
    filename=$(basename "$f")
    mv "$f" "$TARGET/$filename"
    echo "이동 완료: $filename"
  done
  sleep 2
done
