#include <iostream>
#include <conio.h>
#include <windows.h>
#include <vector>
#include <cstdlib>
#include <ctime>
#include <algorithm>  // 添加 algorithm 头文件

using namespace std;

const int WIDTH = 30;   // 地图宽度
const int HEIGHT = 20;  // 地图高度
const int MAX_LENGTH = WIDTH * HEIGHT;

// 方向
enum Direction { STOP = 0, LEFT, RIGHT, UP, DOWN };

// 坐标
struct Point {
    int x, y;
    Point(int x = 0, int y = 0) : x(x), y(y) {}
    bool operator==(const Point& other) const {
        return x == other.x && y == other.y;
    }
};

class SnakeGame {
private:
    vector<Point> snake;       // 蛇身（头在 front）
    Point food;                // 食物位置
    Direction dir;             // 当前方向
    bool gameOver;             // 游戏是否结束
    int score;                 // 得分

    // 隐藏光标
    void hideCursor() {
        HANDLE console = GetStdHandle(STD_OUTPUT_HANDLE);
        CONSOLE_CURSOR_INFO cursorInfo;
        GetConsoleCursorInfo(console, &cursorInfo);
        cursorInfo.bVisible = false;
        SetConsoleCursorInfo(console, &cursorInfo);
    }

    // 设置光标位置
    void gotoxy(int x, int y) {
        COORD coord;
        coord.X = x;
        coord.Y = y;
        SetConsoleCursorPosition(GetStdHandle(STD_OUTPUT_HANDLE), coord);
    }

    // 生成新食物（不与蛇身重叠）
    // 优先在内圈生成（避免食物贴边），内圈满时回退全图
    void generateFood() {
        // 如果蛇已经占满整个地图，直接返回
        if (snake.size() >= WIDTH * HEIGHT) {
            return;
        }

        std::vector<Point> candidates;
        // 内圈：去掉最外一圈
        for (int y = 1; y <= HEIGHT - 2; ++y) {
            for (int x = 1; x <= WIDTH - 2; ++x) {
                Point p(x, y);
                if (std::find(snake.begin(), snake.end(), p) == snake.end()) {
                    candidates.push_back(p);
                }
            }
        }
        // 内圈没有空位时，回退到全图
        if (candidates.empty()) {
            for (int y = 0; y < HEIGHT; ++y) {
                for (int x = 0; x < WIDTH; ++x) {
                    Point p(x, y);
                    if (std::find(snake.begin(), snake.end(), p) == snake.end()) {
                        candidates.push_back(p);
                    }
                }
            }
        }
        if (candidates.empty()) return;
        food = candidates[rand() % candidates.size()];
    }

public:
    SnakeGame() {
        srand(time(0));
        init();
    }

    void init() {
        dir = RIGHT;  // 初始方向向右
        gameOver = false;
        score = 0;

        // 初始蛇：长度为 3，水平放置
        snake.clear();
        snake.push_back(Point(WIDTH / 2, HEIGHT / 2));       // 头
        snake.push_back(Point(WIDTH / 2 - 1, HEIGHT / 2));
        snake.push_back(Point(WIDTH / 2 - 2, HEIGHT / 2));
        if (snake.size() < WIDTH * HEIGHT) {
            generateFood();
        } else {
            // 地图太小，蛇已占满，游戏胜利
            gameOver = true;
        }
    }

    // 绘制地图
    void draw() {
        gotoxy(0, 0);

        // 上边界
        cout << "+";
        for (int i = 0; i < WIDTH; ++i) cout << "-";
        cout << "+" << endl;

        // 中间
        for (int y = 0; y < HEIGHT; ++y) {
            cout << "|";
            for (int x = 0; x < WIDTH; ++x) {
                Point p(x, y);
                if (p == snake[0]) {
                    cout << "●";  // 蛇头
                } else if (std::find(snake.begin() + 1, snake.end(), p) != snake.end()) {
                    cout << "■";  // 蛇身
                } else if (p == food) {
                    cout << "★";  // 食物
                } else {
                    cout << " ";
                }
            }
            cout << "|" << endl;
        }

        // 下边界
        cout << "+";
        for (int i = 0; i < WIDTH; ++i) cout << "-";
        cout << "+" << endl;

        // 显示分数
        cout << "Score: " << score << endl;
        cout << "Press W/A/S/D to move, X to quit." << endl;
    }

    // 输入处理
    void input() {
        if (_kbhit()) {
            char key = _getch();
            switch (key) {
                case 'w': case 'W': if (dir != DOWN)  dir = UP;    break;
                case 's': case 'S': if (dir != UP)    dir = DOWN;  break;
                case 'a': case 'A': if (dir != RIGHT) dir = LEFT;  break;
                case 'd': case 'D': if (dir != LEFT)  dir = RIGHT; break;
                case 'x': case 'X': gameOver = true;               break;
            }
        }
    }

    // 游戏逻辑更新
    void update() {
        if (dir == STOP) return;

        // 计算新蛇头位置
        Point newHead = snake[0];
        switch (dir) {
            case LEFT:  newHead.x--; break;
            case RIGHT: newHead.x++; break;
            case UP:    newHead.y--; break;
            case DOWN:  newHead.y++; break;
        }

        // 检查是否撞墙
        if (newHead.x < 0 || newHead.x >= WIDTH || newHead.y < 0 || newHead.y >= HEIGHT) {
            gameOver = true;
            return;
        }

        // 检查是否吃到食物
        bool eatFood = (newHead == food);
        if (!eatFood) {
            // 没吃到食物，删除尾部
            snake.pop_back();
        }

        // 检查新头是否与蛇身重叠（尾部已删除，但头可能撞到剩余身体）
        if (std::find(snake.begin(), snake.end(), newHead) != snake.end()) {
            gameOver = true;
            return;
        }

        // 插入新头
        snake.insert(snake.begin(), newHead);

        // 如果吃到食物，生成新食物并加分
        if (eatFood) {
            score += 10;
            // 检查是否胜利（蛇已占满地图）
            if (snake.size() >= WIDTH * HEIGHT) {
                gameOver = true;
            } else {
                generateFood();
            }
        }
    }

    // 运行游戏
    void run() {
        hideCursor();
        while (!gameOver) {
            draw();
            input();
            update();
            Sleep(200);  // 控制速度（毫秒）
        }

        // 游戏结束画面
        system("cls");
        if (snake.size() >= WIDTH * HEIGHT) {
            cout << "You Win! You filled the entire map!" << endl;
        } else {
            cout << "Game Over!" << endl;
        }
        cout << "Final Score: " << score << endl;
        cout << "Press any key to exit..." << endl;
        _getch();
    }
};

int main() {
    SnakeGame game;
    game.run();
    return 0;
}



