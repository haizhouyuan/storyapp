#!/usr/bin/env bash
set -euo pipefail

BASE_URL="http://127.0.0.1:8701"
OUT_DIR="testrun/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT_DIR"

declare -a TOPICS=(
  "北海孤岛的沉默号角"
  "月球图书馆的最后读者"
  "沉睡雨林的铜铃鸟"
)

start_workflow() {
  local topic="$1"
  curl -fsS -X POST "$BASE_URL/api/story-workflows" \
    -H 'Content-Type: application/json' \
    -d "$(jq -n --arg t "$topic" '{topic:$t, locale:"zh-CN"}')"
}

poll_workflow() {
  local workflow_id="$1"
  local max_iter=60
  local interval=10
  local result

  for ((i=1; i<=max_iter; i++)); do
    result=$(curl -fsS "$BASE_URL/api/story-workflows/$workflow_id")
    local status
    status=$(echo "$result" | jq -r '.data.status // .status // ""')
    if [[ "$status" == "completed" || "$status" == "done" ]]; then
      echo "$result"
      return 0
    elif [[ "$status" == "failed" || "$status" == "terminated" ]]; then
      echo "$result"
      return 0
    fi
    sleep "$interval"
  done

  echo "$result"
  return 1
}

format_story() {
  local json_file="$1"
  local out_file="$2"
  jq -r '
    def mksection($title; $body): "## " + $title + "\n\n" + $body + "\n\n";
    def jsonblock($title; $value): mksection($title; ("```json\n" + ($value | tojson) + "\n```"));

    .data as $data
    | ($data.topic // "") as $topic
    | ($data.history[-1].outline // $data.outline // null) as $outline
    | ($data.history[-1].storyDraft // $data.storyDraft // null) as $draft
    | ($data.history[-1].review // $data.review // null) as $review
    | ($data.history[-1].validation // $data.validation // null) as $validation
    | "# " + $topic + "\n\n"
      + (if $outline then jsonblock("蓝图 Outline"; $outline) else "" end)
      + (if $draft then
            mksection("故事正文";
              ($draft.chapters // []
                | map("### " + (.title // "(未命名章节)") + "\n\n" + ((.content // "") | gsub("\\r"; "")) + "\n")
                | join("\n")
              )
            )
        else "" end)
      + (if $validation then jsonblock("Stage4 Validation"; $validation) else "" end)
      + (if $review then jsonblock("Stage3 Review"; $review) else "" end)
  ' "$json_file" > "$out_file"
}

case_index=0
for topic in "${TOPICS[@]}"; do
  case_index=$((case_index + 1))
  case_dir="$OUT_DIR/case-${case_index}"
  mkdir -p "$case_dir"

  echo "[INFO] 启动工作流: $topic"
  create_resp=$(start_workflow "$topic")
  echo "$create_resp" > "$case_dir/workflow.create.json"
  workflow_id=$(echo "$create_resp" | jq -r '.data._id // .workflowId // .id // .data.workflowId // empty')
  if [[ -z "$workflow_id" ]]; then
    echo "[ERROR] 无法解析 workflow id" >&2
    continue
  fi

  echo "[INFO] 等待工作流完成 (id=$workflow_id)"
  final_resp=$(poll_workflow "$workflow_id")
  echo "$final_resp" > "$case_dir/workflow.final.json"

  status=$(echo "$final_resp" | jq -r '.data.status // .status // ""')
  echo "[INFO] 工作流状态: $status"

  if [[ "$status" != "completed" && "$status" != "done" ]]; then
    echo "[WARN] 工作流未成功完成，输出仍将被记录" >&2
  fi

  format_story "$case_dir/workflow.final.json" "$case_dir/story.md"

done

# 简要质量报告
report="$OUT_DIR/quality-report.md"
{
  echo "# 质量初步报告\n"
  for dir in "$OUT_DIR"/case-*; do
    [[ -d "$dir" ]] || continue
    topic=$(jq -r '.data.topic // ""' "$dir/workflow.final.json")
    status=$(jq -r '.data.status // ""' "$dir/workflow.final.json")
    outlineActs=$(jq -r '(.history[-1].outline // .outline // {acts:[]}).acts | length' "$dir/workflow.final.json")
    clues=$(jq -r '(.history[-1].outline // .outline // {clueMatrix:[]}).clueMatrix | length' "$dir/workflow.final.json")
    chapters=$(jq -r '(.history[-1].storyDraft // .storyDraft // {chapters:[]}).chapters | length' "$dir/workflow.final.json")

    echo "## $(basename "$dir")"
    echo "- 主题：$topic"
    echo "- 状态：$status"
    echo "- 幕数：$outlineActs"
    echo "- 线索条目：$clues"
    echo "- 章节数：$chapters"
    echo
  done
} > "$report"

echo "[INFO] 结果已输出到 $OUT_DIR"
