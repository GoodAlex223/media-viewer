### T1 similarity (photo set)

| encoder | subject P@1 | subject P@10 | same subject next to each other in the app's sort | copies: R@1 | copies found at 0.1% false pairs |
|---|---|---|---|---|---|
| block-mean hash (app default) | 0.109 | 0.093 | 0.105 | 0.656 | 0.383 |
| CLIP B/32 q8 (app today) | 0.852 | 0.720 | 0.765 | 0.887 | 0.762 |
| CLIP B/32 fp32 | 0.863 | 0.714 | 0.737 | 0.885 | 0.804 |
| CLIP B/32 bnb4 | 0.850 | 0.713 | 0.750 | 0.892 | 0.785 |
| CLIP B/16 fp32 | 0.875 | 0.718 | 0.763 | 0.912 | 0.790 |
| SigLIP 2 B/16 fp32 | 0.870 | 0.740 | 0.753 | 0.952 | 0.935 |
| SigLIP 2 B/16 bnb4 | 0.863 | 0.754 | 0.755 | 0.927 | 0.863 |
| SigLIP 2 B/16 q8 | 0.695 | 0.541 | 0.635 | 0.894 | 0.717 |
| SigLIP 2 B/32-256 fp32 | 0.873 | 0.735 | 0.750 | 0.952 | 0.854 |
| DINOv2-S reg fp32 | 0.878 | 0.697 | 0.753 | 1.000 | 0.996 |
| DINOv2-S reg q8 | 0.784 | 0.642 | 0.691 | 0.988 | 0.921 |
| DINOv2-S fp32 | 0.885 | 0.705 | 0.747 | 1.000 | 0.994 |
| DINOv3-S/16 fp32 | 0.845 | 0.646 | 0.714 | 1.000 | 1.000 |

### T2 copies found at rank 1, by edit

| encoder | crop | jpeg | color | flip | tilt | overlay |
|---|---|---|---|---|---|---|
| block-mean hash (app default) | 0.93 | 1.00 | 1.00 | 0.16 | 0.85 | 0.00 |
| CLIP B/32 q8 (app today) | 1.00 | 0.89 | 1.00 | 1.00 | 1.00 | 0.44 |
| CLIP B/32 fp32 | 1.00 | 0.91 | 1.00 | 1.00 | 0.99 | 0.41 |
| CLIP B/32 bnb4 | 1.00 | 0.93 | 1.00 | 1.00 | 1.00 | 0.42 |
| CLIP B/16 fp32 | 1.00 | 0.91 | 1.00 | 1.00 | 1.00 | 0.56 |
| SigLIP 2 B/16 fp32 | 1.00 | 0.99 | 1.00 | 1.00 | 1.00 | 0.72 |
| SigLIP 2 B/16 bnb4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0.56 |
| SigLIP 2 B/16 q8 | 1.00 | 0.56 | 1.00 | 1.00 | 1.00 | 0.80 |
| SigLIP 2 B/32-256 fp32 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0.71 |
| DINOv2-S reg fp32 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| DINOv2-S reg q8 | 0.99 | 0.94 | 1.00 | 1.00 | 1.00 | 1.00 |
| DINOv2-S fp32 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| DINOv3-S/16 fp32 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |

### T3 like model, held-out ROC AUC (mean of 40 trials)

| features | learner | 2/16, 3+3 | 2/16, 10+10 | 2/16, 30+30 | 5/16, 3+3 | 5/16, 10+10 | 5/16, 30+30 |
|---|---|---|---|---|---|---|---|
| 64 + clip-b32-q8 (app today) | app logistic (raw) | 0.656 | 0.725 | 0.862 | 0.574 | 0.640 | 0.715 |
| clip-b32-q8 | app logistic (raw) | 0.796 | 0.897 | 0.965 | 0.673 | 0.798 | 0.859 |
| 64 + clip-b32-q8 | app logistic (standardised) | 0.766 | 0.879 | 0.918 | 0.673 | 0.791 | 0.893 |
| 64 + clip-b32-q8 | app logistic (train-standardised) | 0.786 | 0.921 | 0.963 | 0.670 | 0.808 | 0.901 |
| 64 + clip-b32-q8 | logistic (standardised, C=1) | 0.820 | 0.926 | 0.963 | 0.698 | 0.840 | 0.925 |
| clip-b32-q8 | logistic (standardised, C=1) | 0.824 | 0.932 | 0.964 | 0.701 | 0.848 | 0.929 |
| clip-b32-q8 | kNN-3 | 0.818 | 0.954 | 0.986 | 0.694 | 0.877 | 0.961 |
| clip-b32-fp32 | logistic (standardised, C=1) | 0.826 | 0.933 | 0.966 | 0.698 | 0.850 | 0.928 |
| clip-b16-fp32 | logistic (standardised, C=1) | 0.821 | 0.926 | 0.960 | 0.700 | 0.850 | 0.934 |
| siglip2-b16-224-fp32 | logistic (standardised, C=1) | 0.825 | 0.936 | 0.971 | 0.697 | 0.845 | 0.934 |
| siglip2-b16-224-fp32 | kNN-3 | 0.822 | 0.958 | 0.987 | 0.693 | 0.879 | 0.961 |
| siglip2-b16-224-bnb4 | logistic (standardised, C=1) | 0.831 | 0.937 | 0.968 | 0.700 | 0.850 | 0.937 |
| siglip2-b16-224-q8 | logistic (standardised, C=1) | 0.753 | 0.857 | 0.908 | 0.649 | 0.776 | 0.856 |
| siglip2-b32-256-fp32 | logistic (standardised, C=1) | 0.821 | 0.934 | 0.967 | 0.700 | 0.846 | 0.931 |
| dinov2reg-s-fp32 | logistic (standardised, C=1) | 0.776 | 0.893 | 0.947 | 0.662 | 0.804 | 0.893 |
| 64 hand-crafted | app logistic (raw) | 0.571 | 0.597 | 0.694 | 0.526 | 0.559 | 0.591 |

### T3b paired AUC difference against the app today (share of trials won)

| features | learner | 2/16, 3+3 | 2/16, 10+10 | 2/16, 30+30 | 5/16, 3+3 | 5/16, 10+10 | 5/16, 30+30 |
|---|---|---|---|---|---|---|---|
| 64 + clip-b32-q8 | app logistic (standardised) | +0.109 (90%) | +0.153 (98%) | +0.056 (80%) | +0.099 (95%) | +0.151 (100%) | +0.179 (100%) |
| 64 + clip-b32-q8 | app logistic (train-standardised) | +0.130 (98%) | +0.196 (100%) | +0.101 (100%) | +0.096 (93%) | +0.167 (100%) | +0.186 (100%) |
| clip-b32-q8 | app logistic (raw) | +0.140 (93%) | +0.172 (100%) | +0.103 (100%) | +0.099 (95%) | +0.158 (98%) | +0.144 (100%) |
| 64 + clip-b32-q8 | logistic (standardised, C=1) | +0.164 (100%) | +0.201 (100%) | +0.101 (95%) | +0.124 (98%) | +0.200 (100%) | +0.210 (100%) |
| clip-b32-q8 | kNN-3 | +0.162 (98%) | +0.229 (100%) | +0.124 (100%) | +0.120 (98%) | +0.236 (100%) | +0.246 (100%) |
| siglip2-b16-224-fp32 | logistic (standardised, C=1) | +0.169 (98%) | +0.211 (100%) | +0.109 (100%) | +0.123 (93%) | +0.205 (100%) | +0.220 (100%) |

### T4 like-or-skip simulation

| features | learner | skips | likes in 60 shown, 0% passed | likes, 20% passed | held-out AUC, 0% / 20% |
|---|---|---|---|---|---|
| 64 + clip-b32-q8 | app logistic (raw) | ignore skips | 16.8 | 13.4 | 0.624 / 0.625 |
| 64 + clip-b32-q8 | app logistic (raw) | skips as dislikes | 25.3 | 19.1 | 0.788 / 0.760 |
| 64 + clip-b32-q8 | ridge (standardised, LOO lambda) | ignore skips | 33.9 | 27.0 | 0.897 / 0.897 |
| 64 + clip-b32-q8 | ridge (standardised, LOO lambda) | skips as dislikes | 36.8 | 26.9 | 0.934 / 0.909 |
| 64 + clip-b32-q8 | ridge (standardised, LOO lambda) | skips as weak dislikes (0.3) | 37.0 | 28.8 | 0.942 / 0.932 |
| 64 + clip-b32-q8 | logistic (standardised, C=1) | ignore skips | 33.4 | 26.6 | 0.892 / 0.890 |
| 64 + clip-b32-q8 | logistic (standardised, C=1) | skips as dislikes | 35.7 | 22.8 | 0.930 / 0.827 |
| 64 + clip-b32-q8 | logistic (standardised, C=1) | skips as weak dislikes (0.3) | 36.6 | 24.8 | 0.934 / 0.861 |
| clip-b32-fp32 | logistic (standardised, C=1) | ignore skips | 34.0 | 27.3 | 0.899 / 0.899 |
| clip-b32-fp32 | logistic (standardised, C=1) | skips as dislikes | 36.5 | 22.1 | 0.936 / 0.823 |
| clip-b32-fp32 | logistic (standardised, C=1) | skips as weak dislikes (0.3) | 37.2 | 23.8 | 0.943 / 0.856 |
| siglip2-b16-224-fp32 | logistic (standardised, C=1) | ignore skips | 34.8 | 27.9 | 0.920 / 0.911 |
| siglip2-b16-224-fp32 | logistic (standardised, C=1) | skips as dislikes | 35.9 | 22.1 | 0.944 / 0.813 |
| siglip2-b16-224-fp32 | logistic (standardised, C=1) | skips as weak dislikes (0.3) | 37.0 | 23.8 | 0.954 / 0.835 |

### T4b weak skips against ignoring skips, paired

| features | learner | liked files passed | likes gained (95% CI) | trials won |
|---|---|---|---|---|
| clip-b32-fp32 | ridge (standardised, LOO lambda) | 0% | +2.3 (+1.1 to +3.5) | 70% |
| clip-b32-fp32 | ridge (standardised, LOO lambda) | 20% | +0.8 (-0.2 to +1.8) | 48% |
| clip-b32-fp32 | logistic (standardised, C=1) | 0% | +3.3 (+1.7 to +4.8) | 60% |
| clip-b32-fp32 | logistic (standardised, C=1) | 20% | -3.5 (-5.2 to -1.9) | 20% |
| 64 + clip-b32-q8 | ridge (standardised, LOO lambda) | 0% | +3.0 (+1.4 to +4.7) | 65% |
| 64 + clip-b32-q8 | ridge (standardised, LOO lambda) | 20% | +1.7 (+0.4 to +3.1) | 48% |
| 64 + clip-b32-q8 | logistic (standardised, C=1) | 0% | +3.3 (+1.5 to +5.0) | 65% |
| 64 + clip-b32-q8 | logistic (standardised, C=1) | 20% | -1.9 (-3.6 to -0.1) | 33% |
| siglip2-b16-224-fp32 | ridge (standardised, LOO lambda) | 0% | +2.7 (+1.4 to +4.0) | 57% |
| siglip2-b16-224-fp32 | ridge (standardised, LOO lambda) | 20% | +0.8 (-0.2 to +1.8) | 38% |
| siglip2-b16-224-fp32 | logistic (standardised, C=1) | 0% | +2.2 (+0.7 to +3.7) | 48% |
| siglip2-b16-224-fp32 | logistic (standardised, C=1) | 20% | -4.1 (-6.0 to -2.2) | 23% |
| siglip2-b32-256-fp32 | ridge (standardised, LOO lambda) | 0% | +3.4 (+1.9 to +4.8) | 73% |
| siglip2-b32-256-fp32 | ridge (standardised, LOO lambda) | 20% | +1.1 (-0.3 to +2.4) | 48% |
| siglip2-b32-256-fp32 | logistic (standardised, C=1) | 0% | +2.8 (+1.2 to +4.5) | 63% |
| siglip2-b32-256-fp32 | logistic (standardised, C=1) | 20% | -4.0 (-5.8 to -2.3) | 20% |

### T5 quality taste

| features | learner | 5+5 | 10+10 | 20+20 |
|---|---|---|---|---|
| 64 + clip-b32-q8 | app logistic (raw) | 0.527 ± 0.016 | 0.556 ± 0.016 | 0.572 ± 0.015 |
| 64 hand-crafted | logistic (standardised, C=1) | 0.545 ± 0.018 | 0.563 ± 0.017 | 0.581 ± 0.017 |
| clip-b32-q8 | logistic (standardised, C=1) | 0.503 ± 0.014 | 0.520 ± 0.013 | 0.546 ± 0.015 |
| clip-b32-fp32 | logistic (standardised, C=1) | 0.557 ± 0.017 | 0.602 ± 0.016 | 0.663 ± 0.018 |
| 64 + clip-b32-fp32 | logistic (standardised, C=1) | 0.561 ± 0.016 | 0.609 ± 0.017 | 0.667 ± 0.018 |
| clip-b32-bnb4 | logistic (standardised, C=1) | 0.541 ± 0.015 | 0.569 ± 0.018 | 0.637 ± 0.020 |
| clip-b16-fp32 | logistic (standardised, C=1) | 0.583 ± 0.018 | 0.632 ± 0.018 | 0.675 ± 0.015 |
| 64 + clip-b16-fp32 | logistic (standardised, C=1) | 0.585 ± 0.017 | 0.637 ± 0.018 | 0.681 ± 0.015 |
| siglip2-b16-224-fp32 | logistic (standardised, C=1) | 0.530 ± 0.015 | 0.557 ± 0.016 | 0.600 ± 0.013 |
| siglip2-b32-256-fp32 | logistic (standardised, C=1) | 0.522 ± 0.014 | 0.542 ± 0.016 | 0.573 ± 0.012 |
| dinov2reg-s-fp32 | logistic (standardised, C=1) | 0.499 ± 0.014 | 0.522 ± 0.015 | 0.530 ± 0.015 |
| clip-b32-q8 | LAION aesthetic v1 head, no labels | 0.574 ± 0.004 | 0.573 ± 0.006 | 0.571 ± 0.013 |
| clip-b32-q8 | ridge + aesthetic prior | 0.541 ± 0.009 | 0.543 ± 0.008 | 0.542 ± 0.014 |

### T5b quality taste: file A minus file B, paired (share of trials won)

| comparison (logistic, C=1) | 5+5 | 10+10 | 20+20 |
|---|---|---|---|
| CLIP B/32 fp32 minus CLIP B/32 q8 (app today) | +0.053 ± 0.009 (98%) | +0.081 ± 0.010 (100%) | +0.117 ± 0.012 (100%) |
| CLIP B/32 bnb4 minus CLIP B/32 q8 (app today) | +0.038 ± 0.008 (93%) | +0.049 ± 0.012 (93%) | +0.090 ± 0.014 (100%) |
| SigLIP 2 B/16 fp32 minus SigLIP 2 B/16 q8 | +0.013 ± 0.016 (57%) | +0.026 ± 0.015 (68%) | +0.034 ± 0.016 (73%) |

### T6 zero-shot tags and text search

| image + text tower | tag accuracy (16 prompts) | text search mAP | text search P@10 |
|---|---|---|---|
| clip-b32-fp32+text-fp32 | 0.911 | 0.884 | 0.956 |
| clip-b32-q8+text-q8 | 0.896 | 0.850 | 0.956 |
| siglip2-b16-224-fp32+text-fp32 | 0.926 | 0.937 | 0.994 |
| siglip2-b16-224-fp32+text-q8 | 0.934 | 0.936 | 0.988 |
| siglip2-b16-224-q8+text-q8 | 0.776 | 0.803 | 0.919 |
| siglip2-b32-256-fp32+text-q8 | 0.924 | 0.936 | 0.988 |

### T7 speed and size, pass 1 / pass 2

| encoder | file MB | CPU infer ms (Node) | CPU decode+prep+infer ms | Electron main, CPU infer ms | DirectML infer ms (RTX 3050 Ti) | Electron main-thread stall p99 ms | peak RSS MB (Node CPU) |
|---|---|---|---|---|---|---|---|
| CLIP B/16 fp32 | 345.1 | 150.5 / 123.5 | 185.9 / 153.6 | 121.7 / 119.6 | 26.9 / 24.2 | 178.8 / 169.2 | 848 / 499 |
| CLIP B/32 bnb4 | 58.3 | 134.4 / 89.2 | 190.2 / 126.6 | 118.7 / 63 | 481.4 / 224.4 | 243.4 / 115.5 | 207 / 216 |
| CLIP B/32 fp32 | 351.7 | 74.8 / 43.3 | 115.5 / 74.2 | 62.1 / 40.9 | 29.8 / 20.1 | 107 / 69.9 | 735 / 499 |
| CLIP B/32 q8 (app today) | 89.1 | 57.6 / 29.8 | 102.6 / 58.2 | 80.2 / 25.1 | failed / failed | 184 / 52.1 | 152 / 243 |
| DINOv2-S reg fp32 | 88.5 | 101 / 88.6 | 133.9 / 114.6 | 98.6 / 92.5 | 91.5 / 83.9 | 131.4 / 125.9 | 239 / 240 |
| DINOv2-S reg q8 | 24.4 | 89.1 / 85.8 | 117.3 / 113.9 | 84.2 / 100.9 | 96.7 / 92.6 | 120.1 / 212.7 | 177 / 187 |
| DINOv3-S/16 fp32 | 86.5 | 56.3 / 54.9 | 83.1 / 81.1 | 57.8 / 56.9 | failed / failed | 99 / 115.1 | 230 / 234 |
| SigLIP 2 B/16 bnb4 | 57.6 | 250.5 / 166.2 | 279.1 / 190.6 | 222.3 / 166 | 632.4 / 434.4 | 345 / 233.4 | 214 / 222 |
| SigLIP 2 B/16 fp16 | 186 | failed / failed | failed / failed | failed / failed | 32 / 23.5 | failed / failed | failed / failed |
| SigLIP 2 B/16 fp32 | 371.8 | 227.2 / 126 | 285.4 / 151.8 | 198.6 / 131.4 | 36.1 / 27.8 | 395.1 / 209.5 | 697 / 541 |
| SigLIP 2 B/32-256 fp32 | 378.5 | 54.9 / 50.8 | 85.2 / 79.7 | 75.1 / 47.8 | 26.8 / 19.5 | 132.6 / 101.2 | 918 / 531 |

### T8 inference in Electron main vs a utilityProcess

| encoder | pass | where inference runs | main-thread event-loop delay p50 / p99 / max ms | median inference ms |
|---|---|---|---|---|
| CLIP B/32 q8 (app today) | 1 | main process (today) | 6 / 66.2 / 421.3 | 29.3 |
| CLIP B/32 q8 (app today) | 1 | utilityProcess | 15.8 / 20.3 / 21.2 | 27.3 |
| SigLIP 2 B/16 fp32 | 1 | main process (today) | 5 / 163.7 / 975.7 | 126 |
| SigLIP 2 B/16 fp32 | 1 | utilityProcess | 15.6 / 25.3 / 848.3 | 131.5 |
| CLIP B/32 q8 (app today) | 2 | main process (today) | 5.6 / 55.6 / 424.1 | 28.9 |
| CLIP B/32 q8 (app today) | 2 | utilityProcess | 15.2 / 19.9 / 21.3 | 29.4 |
| SigLIP 2 B/16 fp32 | 2 | main process (today) | 5 / 211.3 / 1019.2 | 125.6 |
| SigLIP 2 B/16 fp32 | 2 | utilityProcess | 15.5 / 20.1 / 23.2 | 127.1 |

### FIDELITY quantised vs fp32 embeddings (compare-runs.js)

| file | compared with | images | cosine median | 10th percentile | minimum |
|---|---|---|---|---|---|
| clip-b32-q8 (q8, cpu) | clip-b32-fp32 (fp32, cpu) | 993 | 0.915 | 0.864 | 0.685 |
| clip-b32-bnb4 (bnb4, cpu) | clip-b32-fp32 (fp32, cpu) | 993 | 0.969 | 0.951 | 0.845 |
| siglip2-b16-224-q8 (q8, cpu) | siglip2-b16-224-fp32 (fp32, cpu) | 993 | 0.785 | 0.663 | 0.542 |
| siglip2-b16-224-bnb4 (bnb4, cpu) | siglip2-b16-224-fp32 (fp32, cpu) | 993 | 0.968 | 0.951 | 0.889 |
| dinov2reg-s-q8 (q8, cpu) | dinov2reg-s-fp32 (fp32, cpu) | 993 | 0.805 | 0.449 | 0.005 |

### T9 robustness: artwork-heavy set

| encoder | subject P@1 | subject P@10 | same subject next to each other in the app's sort | copies: R@1 | copies found at 0.1% false pairs |
|---|---|---|---|---|---|
| block-mean hash (app default) | 0.095 | 0.089 | 0.101 | 0.675 | 0.398 |
| CLIP B/32 q8 (app today) | 0.631 | 0.475 | 0.530 | 0.869 | 0.702 |
| CLIP B/32 fp32 | 0.637 | 0.457 | 0.532 | 0.879 | 0.719 |
| SigLIP 2 B/16 fp32 | 0.686 | 0.491 | 0.576 | 0.908 | 0.792 |
| SigLIP 2 B/16 q8 | 0.505 | 0.345 | 0.416 | 0.810 | 0.558 |
| DINOv2-S reg fp32 | 0.657 | 0.510 | 0.581 | 1.000 | 0.965 |
| DINOv2-S reg q8 | 0.606 | 0.441 | 0.525 | 0.979 | 0.912 |

| features | learner | 2/16, 3+3 | 2/16, 10+10 | 2/16, 30+30 | 5/16, 3+3 | 5/16, 10+10 | 5/16, 30+30 |
|---|---|---|---|---|---|---|---|
| 64 + clip-b32-q8 (app today) | app logistic (raw) | 0.602 | 0.650 | 0.753 | 0.562 | 0.599 | 0.658 |
| clip-b32-q8 | app logistic (raw) | 0.724 | 0.790 | 0.878 | 0.624 | 0.699 | 0.785 |
| 64 + clip-b32-q8 | app logistic (standardised) | 0.689 | 0.778 | 0.849 | 0.604 | 0.698 | 0.812 |
| 64 + clip-b32-q8 | app logistic (train-standardised) | 0.703 | 0.799 | 0.897 | 0.593 | 0.698 | 0.818 |
| 64 + clip-b32-q8 | logistic (standardised, C=1) | 0.729 | 0.798 | 0.889 | 0.624 | 0.724 | 0.834 |
| clip-b32-q8 | logistic (standardised, C=1) | 0.736 | 0.804 | 0.891 | 0.628 | 0.727 | 0.836 |
| clip-b32-q8 | kNN-3 | 0.739 | 0.819 | 0.918 | 0.620 | 0.738 | 0.850 |
| clip-b32-fp32 | logistic (standardised, C=1) | 0.735 | 0.795 | 0.889 | 0.629 | 0.722 | 0.831 |
| siglip2-b16-224-fp32 | logistic (standardised, C=1) | 0.754 | 0.826 | 0.913 | 0.638 | 0.753 | 0.856 |
| siglip2-b16-224-fp32 | kNN-3 | 0.750 | 0.833 | 0.926 | 0.627 | 0.750 | 0.857 |
| siglip2-b16-224-q8 | logistic (standardised, C=1) | 0.679 | 0.733 | 0.818 | 0.603 | 0.668 | 0.756 |
| dinov2reg-s-fp32 | logistic (standardised, C=1) | 0.725 | 0.795 | 0.888 | 0.618 | 0.715 | 0.822 |
| 64 hand-crafted | app logistic (raw) | 0.550 | 0.571 | 0.623 | 0.537 | 0.553 | 0.565 |

